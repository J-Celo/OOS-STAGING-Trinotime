// M2.9.62 — synthetic tests. Never accesses live Firebase or Worker.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {scopeRosterSnapshotM2962} from '../src/scoped-roster-m2962.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS M2962:',name);};
const a='Demon Slayer',b='Solo Leveling',c='Albertsons · Albert Test';
const state={
 policy:{unreviewedSecret:'not-for-client'},authority:'workforce-roster-v1',
 podDirectory:{schemaVersion:1,revision:3,verified:true,entries:[
  {id:a,team:'CWH',name:a,system:true},{id:b,team:'CWH',name:b,system:true},{id:c,team:'ALBERTSONS',name:'Albert Test',system:true}]},
 teamLeaderDirectory:{schemaVersion:1,verified:true,revision:8,entries:[
  {name:'Leader A',pod:a,active:true,contact:'PRIVATE-TL-A'},
  {name:'Leader B',pod:b,active:true,contact:'PRIVATE-TL-B'},
  {name:'Leader C',pod:c,active:true,contact:'PRIVATE-TL-C'}]},
 employees:{schemaVersion:1,version:'QA-1',verified:true,entries:[
  {name:'Agent A',pod:a,active:true,employeeId:'id-a',payroll:'PRIVATE-A'},
  {name:'Agent A2',pod:a,active:true,email:'PRIVATE-A2',payroll:'PRIVATE-A2'},
  {name:'Agent B',pod:b,active:true,passwordHash:'PRIVATE-B'},
  {name:'Agent C',pod:c,active:true,homeAddress:'PRIVATE-C'}]}
};
check('Scoped read returns the complete roster for verified Admin actor',()=>{
 const result=scopeRosterSnapshotM2962(state,{role:'admin'});
 assert.equal(result.scope,'all-pods');assert.equal(result.employees.entries.length,4);
 assert.equal(result.policy.unreviewedSecret,'not-for-client');
});
check('Team Leader receives only assigned POD and workers',()=>{
 const result=scopeRosterSnapshotM2962(state,{role:'team_leader',name:'Leader A',pod:a});
 assert.equal(result.scope,'own-pod');assert.deepEqual(result.employees.entries.map(x=>x.name),['Agent A','Agent A2']);
 assert.deepEqual(result.teamLeaderDirectory.entries.map(x=>x.name),['Leader A']);
 assert.deepEqual(result.podDirectory.entries.map(x=>x.id),[a]);
 assert.equal(result.employees.entries[0].payroll,'PRIVATE-A');
 assert.equal(result.employees.version,'QA-1');
 assert.equal('policy' in result,false);
});
check('Agents get own POD only, with minimal coworker records',()=>{
 const result=scopeRosterSnapshotM2962(state,{role:'agent',name:'Agent A',pod:a});
 assert.equal(result.scope,'own-pod-minimal-coworkers');
 assert.equal(result.employees.entries.length,2);
 assert.equal(result.employees.entries[0].employeeId,'id-a');
 assert.deepEqual(result.employees.entries[1],{name:'Agent A2',pod:a,active:true,role:'agent'});
 assert.ok(!JSON.stringify(result).includes('PRIVATE-A2'));
 assert.ok(!JSON.stringify(result).includes('PRIVATE-B'));
 assert.ok(!JSON.stringify(result).includes('PRIVATE-C'));
 assert.ok(!JSON.stringify(result).includes('PRIVATE-TL-B'));
});
check('Cross-company and cross-POD requests never override the actor POD',()=>{
 const result=scopeRosterSnapshotM2962(state,{role:'team_leader',name:'Leader C',pod:c,requestedPod:a});
 assert.deepEqual(result.employees.entries.map(x=>x.name),['Agent C']);
 assert.deepEqual(result.podDirectory.entries.map(x=>x.id),[c]);
 assert.ok(!JSON.stringify(result).includes('PRIVATE-A'));
});
check('Missing/invalid actor authorization fails closed',()=>{
 for(const actor of [{role:'agent',name:'Agent A',pod:''},{role:'team_leader',name:'Leader A',pod:'Other'},
 {role:'anonymous',name:'Unknown',pod:a},{role:'agent',name:'',pod:a},{}])
  assert.throws(()=>scopeRosterSnapshotM2962(state,actor));
});
check('Legacy snapshot is now scoped; TL transfer readback remains scoped',()=>{
 assert.match(worker,/if\(path==='\/snapshot'&&request\.method==='GET'\)\{const actor=await requireWorkforceAttendanceActor\(request,env\);const state=await rosterResolvedStateServer\(env\);const visible=scopeRosterSnapshotM2962\(state,actor\);/);
 assert.match(worker,/if\(path==='\/scoped-snapshot'&&request\.method==='GET'\)\{const actor=await requireWorkforceAttendanceActor\(request,env\);const state=await rosterResolvedStateServer\(env\);return json\(\{ok:true,\.\.\.scopeRosterSnapshotM2962\(state,actor\)\}\);\}/);
 assert.ok(fs.readFileSync(path.join(root,'public/assets/js/j-b52f8ff97ca5.js'),'utf8').includes("rosterAuthorityFetch('scoped-snapshot'"));
});
console.log(`M2962: ${passed} scoped-read security checks passed. Original /kv and legacy roster snapshot still require migration.`);
