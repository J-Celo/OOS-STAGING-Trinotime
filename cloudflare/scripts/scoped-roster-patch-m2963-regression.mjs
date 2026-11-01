// M2.9.63 synthetic tests. No Firebase network, secrets, or live mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scopedRosterEmployeePatchM2963,scopedRosterPatchReceiptM2963} from '../src/scoped-roster-patch-m2963.js';
const original={employees:{verified:true,version:'v1',entries:[
  {name:'Agent One',pod:'Demon Slayer',active:true,employeeId:'1',privateEmail:'private1'},
  {name:'Agent Two',pod:'Demon Slayer',active:true,employeeId:'2',payroll:'secret2'},
  {name:'Agent Three',pod:'Solo Leveling',active:true,employeeId:'3',payroll:'secret3'},
  {name:'Agent Four',pod:'Albert Pod',active:true,employeeId:'4',payroll:'secret4'}]},
  teamLeaderDirectory:{verified:true,entries:[{name:'Leader',pod:'Demon Slayer'}]},
  podDirectory:{verified:true,entries:[{id:'Demon Slayer',team:'CWH',active:true},{id:'Solo Leveling',team:'CWH',active:true},{id:'Albert Pod',team:'ALBERTSONS',active:true}]}};
const agent={role:'agent',name:'Agent One',pod:'Demon Slayer'},tl={role:'team_leader',name:'Leader',pod:'Demon Slayer'};
const req=(operation,rest={})=>({operation,baseVersion:'v1',targetVersion:'v2',mutationId:'qa-mutation-1',...rest});
let tests=0;function test(name,fn){fn();++tests;console.log('PASS M2963:',name)}
const deny=(actor,body,state=original)=>assert.throws(()=>scopedRosterEmployeePatchM2963(state,actor,body),e=>e?.code==='SCOPED_ROSTER_PATCH_DENIED');
test('Agent rename updates only their own name; retains all other canonical records unchanged',()=>{
 const patch=scopedRosterEmployeePatchM2963(original,agent,req('rename',{newName:'Agent One New'}));
 assert.equal(patch.entries[0].name,'Agent One New');assert.equal(patch.entries[0].privateEmail,'private1');
 assert.deepEqual(patch.entries.slice(1),original.employees.entries.slice(1));assert.equal(original.employees.entries[0].name,'Agent One');
});
test('Agent cannot rename another identity even if naming a target',()=>deny(agent,req('rename',{targetName:'Agent Two',newName:'Agent One New'})));
test('Agent cannot transfer anyone',()=>deny(agent,req('transfer',{targetName:'Agent One',newPod:'Solo Leveling'})));
test('TL rename own POD employee without reading or writing altered records in other PODs',()=>{
 const patch=scopedRosterEmployeePatchM2963(original,tl,req('rename',{targetName:'Agent Two',newName:'Agent Two New'}));
 assert.equal(patch.entries[1].name,'Agent Two New');assert.equal(patch.entries[1].payroll,'secret2');
 assert.deepEqual(patch.entries[2],original.employees.entries[2]);
});
test('TL transfer to another POD in same verified team merges canonical roster',()=>{
 const patch=scopedRosterEmployeePatchM2963(original,tl,req('transfer',{targetName:'Agent One',newPod:'Solo Leveling'}));
 assert.equal(patch.entries[0].pod,'Solo Leveling');assert.equal(patch.entries[0].privateEmail,'private1');
 assert.deepEqual(patch.entries.slice(1),original.employees.entries.slice(1));
});
test('TL cannot transfer outside team or to non-existent POD',()=>{
 deny(tl,req('transfer',{targetName:'Agent One',newPod:'Albert Pod'}));deny(tl,req('transfer',{targetName:'Agent One',newPod:'Made Up'}));
});
test('TL cannot rename an agent from another POD',()=>deny(tl,req('rename',{targetName:'Agent Three',newName:'Stolen Name'})));
test('Client cannot submit complete roster, a private attribute, or unsupported operation',()=>{
 deny(tl,req('rename',{targetName:'Agent One',newName:'Renamed',entries:[]}));
 deny(tl,req('rename',{targetName:'Agent One',newName:'Renamed',payroll:'OVERWRITE'}));
 deny(tl,req('remove',{targetName:'Agent One'}));
});
test('Rejects wrong base version and target version replay',()=>{
 deny(tl,req('rename',{targetName:'Agent One',newName:'New',baseVersion:'old'}));
 deny(tl,req('rename',{targetName:'Agent One',newName:'New',targetVersion:'v1'}));
});
test('Never edits an unverified roster or inactive target',()=>{
 deny(tl,req('rename',{targetName:'Agent One',newName:'New'}),{...original,employees:{...original.employees,verified:false}});
 const copy=structuredClone(original);copy.employees.entries[0].active=false;deny(tl,req('rename',{targetName:'Agent One',newName:'New'}),copy);
});
test('Rejects role escalation or missing actor POD',()=>{deny({role:'admin',pod:'Demon Slayer',name:'Admin'},req('rename',{targetName:'Agent One',newName:'New'}));deny({role:'team_leader',pod:'',name:'Leader'},req('rename',{targetName:'Agent One',newName:'New'}));});
test('Scoped receipt strips private and cross-POD document on success and conflict',()=>{
 const result=scopedRosterPatchReceiptM2963({remoteSaved:true,version:'v2',scope:'team-leader-pod',document:original.employees,hiddenSecret:'DO_NOT_LEAK'});
 assert.equal(result.version,'v2');assert.equal(result.rosterRefreshRequired,true);
 assert.ok(!JSON.stringify(result).includes('Agent One'));assert.ok(!JSON.stringify(result).includes('DO_NOT_LEAK'));
 const conflict=scopedRosterPatchReceiptM2963({conflict:true,remoteVersion:'v3',document:original.employees});
 assert.equal(conflict.remoteVersion,'v3');assert.equal(conflict.document,undefined);
});
test('Worker requires verified actor, makes canonical merge, uses same CAS roster writer and returns redacted receipt',()=>{
 const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
 assert.match(worker,/if\(path==='\/employees\/scoped-patch'&&request.method==='PATCH'\)\{const actor=await requireWorkforceAttendanceActor\(request,env\);const state=await rosterResolvedStateServer\(env\);/);
 assert.match(worker,/const result=await rosterWriteEmployeesServer\(env,actor,intent\)/);
 assert.match(worker,/scopedRosterPatchReceiptM2963\(result\)/);
 assert.match(worker,/firebaseAdminSetIfMatch\(env, WORKFORCE_ROSTER_EMPLOYEE_PATH, next, observed.etag\)/);
});
console.log(`M2963: ${tests} offline scoped patch security tests passed; frontend and /kv read cutover remain pending.`);
