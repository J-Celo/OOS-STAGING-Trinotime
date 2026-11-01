import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scopeRosterSnapshotM2962 } from '../src/scoped-roster-m2962.js';
import { scopedRosterEmployeePatchM2963 } from '../src/scoped-roster-patch-m2963.js';

// Packaging/release guard: tracks residual exposure and tests permissions
// with synthetic data only. NO requests, credential inspection, database access,
// or publication of security rules. Passing != /kv secure.
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js',import.meta.url),'utf8');
const rules=JSON.parse(fs.readFileSync(new URL('../../firebase/RTDB-M2955-STAGING-REVIEW-ONLY.json',import.meta.url),'utf8'));
let passed=0;
function check(title, fn){fn();passed++;console.log('PASS M2965:',title);}
const state={
 podDirectory:{verified:true,revision:4,entries:[{id:'Pod A',team:'CWH',active:true},{id:'Pod B',team:'CWH',active:true},{id:'Alb Pod',team:'ALBERTSONS',active:true}]},
 teamLeaderDirectory:{verified:true,revision:3,entries:[{name:'TL A',pod:'Pod A',active:true},{name:'TL B',pod:'Pod B',active:true}]},
 employees:{verified:true,version:'v1',entries:[
  {name:'Agent A',pod:'Pod A',active:true,salary:'do not expose',passwordHash:'do not expose'},
  {name:'Agent B',pod:'Pod A',active:true,phone:'do not expose'},
  {name:'Agent C',pod:'Pod B',active:true,phone:'do not expose'},
  {name:'Agent D',pod:'Alb Pod',active:true,phone:'do not expose'}
 ]}
};
check('Agent scoped read hides other PODs and private coworker fields',()=>{
 const doc=scopeRosterSnapshotM2962(state,{role:'agent',name:'Agent A',pod:'Pod A'});
 assert.equal(doc.employees.entries.length,2);
 assert.equal(doc.employees.entries.find(x=>x.name==='Agent C'),undefined);
 const colleague=doc.employees.entries.find(x=>x.name==='Agent B');
 assert(!('phone' in colleague));assert(!('passwordHash' in colleague));
});
check('TL scoped read excludes cross-POD and cross-company employees',()=>{
 const doc=scopeRosterSnapshotM2962(state,{role:'team_leader',name:'TL A',pod:'Pod A'});
 assert.equal(doc.employees.entries.length,2);
 assert(doc.employees.entries.every(x=>x.pod==='Pod A'));
});
check('Scoped PATCH rejects TL attempts to edit another POD',()=>{
 assert.throws(()=>scopedRosterEmployeePatchM2963(state,{role:'team_leader',pod:'Pod A',name:'TL A'},
  {operation:'transfer',targetName:'Agent C',newPod:'Pod A',baseVersion:'v1',targetVersion:'v2',mutationId:'x'}));
});
check('Scoped roster endpoints authenticate caller in Worker',()=>{
 assert.match(worker,/path==='\/scoped-snapshot'&&request\.method==='GET'\)\{const actor=await requireWorkforceAttendanceActor\(request,env\)/);
 assert.match(worker,/path==='\/employees\/scoped-patch'&&request\.method==='PATCH'\)\{const actor=await requireWorkforceAttendanceActor\(request,env\)/);
});
check('Review-only rules keep /serverTimeAudit locked',()=>{
 assert.equal(rules.rules.serverTimeAudit['.read'],false);
 assert.equal(rules.rules.serverTimeAudit['.write'],false);
});
check('Client /kv reads removed; published rules explicitly remain unchanged',()=>{
 assert.equal(rules.rules.kv['.read'],'auth != null');
 assert.equal((client.match(/\b(?:fbDb|db)\.ref\(['"]kv/g)||[]).length,0);assert.match(client,/const liveKvRef = secureWorkspaceRef\('kv'\)/);
 assert.match(worker,/path==='\/snapshot'&&request\.method==='GET'\)\{const actor=await requireWorkforceAttendanceActor\(request,env\)/);
 assert.match(worker,/path==='\/employees'&&request\.method==='PUT'\)\{const actor=await requireWorkforceAttendanceActor\(request,env\)/);
});
console.log(`M2965: ${passed} synthetic/offline release guards passed.`);
console.log('REMAINING SECURITY BLOCKERS: live staging acceptance, Emulator compatibility, and approved broad /kv rule cutover.');
