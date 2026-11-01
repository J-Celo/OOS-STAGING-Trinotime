// M2.9.64: isolated synthetic coverage. No Firebase, Cloudflare or real workforce data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { scopedRosterEmployeePatchM2963 } from '../src/scoped-roster-patch-m2963.js';
const source=fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js',import.meta.url),'utf8');
const begin=source.indexOf('async function rosterAuthorityScopedTransferM2964(');
const end=source.indexOf('async function rosterAuthorityWriteEmployees(',begin);
assert(begin>0&&end>begin,'Scoped browser transfer must exist');
const code=source.slice(begin,end);
const server=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
let count=0;
async function test(title,fn){await fn();count++;console.log('PASS M2964:',title)}
const state={employees:{verified:true,version:'v1',entries:[
 {name:'Agent One',pod:'Demon Slayer',active:true,private:'secret',podTransferHistory:[{fromPod:'Old',toPod:'Demon Slayer',by:'Previous'}]},
 {name:'Other Pod',pod:'Solo Leveling',active:true,internalPayroll:'should-not-leak'}
]},podDirectory:{verified:true,entries:[
 {id:'Demon Slayer',team:'CWH',active:true},{id:'Solo Leveling',team:'CWH',active:true},{id:'ALB',team:'ALBERTSONS',active:true}
]},teamLeaderDirectory:{verified:true,entries:[{name:'Leader',pod:'Demon Slayer',active:true}]}};
const actor={role:'team_leader',pod:'Demon Slayer',name:'Leader'};
await test('server persists traceable history, retaining prior immutable entry',async()=>{
 const result=scopedRosterEmployeePatchM2963(state,actor,{operation:'transfer',targetName:'Agent One',newPod:'Solo Leveling',baseVersion:'v1',targetVersion:'v2',mutationId:'m1'});
 const t=result.entries[0];assert.equal(t.pod,'Solo Leveling');assert.equal(t.podTransferHistory.length,2);
 assert.equal(t.podTransferHistory[0].by,'Previous');assert.equal(t.podTransferHistory[1].by,'Leader');
 assert.equal(t.podTransferHistory[1].fromPod,'Demon Slayer');assert.equal(t.podTransferHistory[1].toPod,'Solo Leveling');
 assert(!Number.isNaN(Date.parse(t.podTransferHistory[1].at)));assert.deepEqual(result.entries[1],state.employees.entries[1]);
 assert.equal(state.employees.entries[0].pod,'Demon Slayer');
});
await test('cross-company transfer is rejected server-side',async()=>{
 assert.throws(()=>scopedRosterEmployeePatchM2963(state,actor,{operation:'transfer',targetName:'Agent One',newPod:'ALB',baseVersion:'v1',targetVersion:'v2',mutationId:'m1'}));
});
await test('server rejects forged browser history and payroll fields',async()=>{
 assert.throws(()=>scopedRosterEmployeePatchM2963(state,actor,{operation:'transfer',targetName:'Agent One',newPod:'Solo Leveling',baseVersion:'v1',targetVersion:'v2',mutationId:'m1',podTransferHistory:[]}));
});
const readReceipt={payload:JSON.stringify([{name:'Agent One',pod:'Solo Leveling'},{name:'Other Pod',pod:'Solo Leveling'}]),version:'qa-v2'};
function run({response={remoteSaved:true,version:'qa-v2'},limited={employees:{version:'qa-v2',entries:[]}},receipt=readReceipt,failAt='',context='ctx'}={}){
 const calls=[],updates=[];
 const sandbox={
  createBlobVersion:()=> 'qa-v2',
  podTransferAssertContext:(got)=>{calls.push('ctx');if(got!==context||failAt==='context')throw Error('session changed');},
  rosterAuthorityFetch:async(path,args)=>{calls.push(path);if(failAt===path)throw Error('network down');return path==='employees/scoped-patch'?response:limited;},
  readSharedBlobServerReceipt:async()=>{calls.push('read-back');if(failAt==='read-back')throw Error('readback failed');return receipt;},
  applyPodTransferReceipt:(key,item)=>updates.push({key,item}),
  String,JSON,Error
 };
 const fn=vm.runInNewContext(code+'\nrosterAuthorityScopedTransferM2964',{...sandbox});
 return {invoke:()=>fn('Agent One','Solo Leveling','v1',context),calls,updates};
}
await test('TL UI sends only scoped transfer intent and server version guard',async()=>{
 const {invoke,calls,updates}=run();const result=await invoke();assert.equal(result.version,'qa-v2');
 assert(calls.includes('employees/scoped-patch'));assert(calls.includes('scoped-snapshot'));assert(calls.includes('read-back'));
 assert.equal(updates.length,1);assert.equal(updates[0].key,'employees');
});
await test('no UI apply if server rejects the write',async()=>{
 const {invoke,updates}=run({response:{remoteSaved:false,conflict:true,remoteVersion:'v3'}});
 await assert.rejects(invoke(),e=>e.definitive===true);assert.equal(updates.length,0);
});
await test('no UI apply if server cannot confirm the commit',async()=>{
 const {invoke,updates}=run({response:{remoteSaved:false}});
 await assert.rejects(invoke(),e=>e.outcomeUnknown===true);assert.equal(updates.length,0);
});
await test('no UI apply if readback lacks transferred identity',async()=>{
 const {invoke,updates}=run({receipt:{payload:JSON.stringify([{name:'Agent One',pod:'Demon Slayer'}]),version:'qa-v2'}});
 await assert.rejects(invoke(),e=>e.outcomeUnknown===true);assert.equal(updates.length,0);
});
await test('network failure marks outcome unknown; do not retry mutation',async()=>{
 const {invoke,updates}=run({failAt:'employees/scoped-patch'});
 await assert.rejects(invoke(),e=>e.outcomeUnknown===true);assert.equal(updates.length,0);
});
await test('scoped snapshots hide transferred Agents after they leave origin POD',async()=>{
 const {invoke,updates}=run({limited:{employees:{version:'qa-v2',entries:[]}}});
 await invoke();assert.equal(updates.length,1);
});
await test('complex multi-Agent and Admin transfers retain existing compatibility contract',async()=>{
 assert.match(source,/const scopedTlTransfer = !isAdmin && isTeamLeader && moves\.length === 1 && !scheduleChanged/);
 assert.match(source,/rosterAuthorityScopedTransferM2964\(moves\[0\]\.name, moves\[0\]\.toPod, rosterReceipt\.version, context\)/);
 assert.match(source,/writePodTransferBlob\('employees', JSON\.stringify\(nextRoster\), rosterReceipt\.version, context\)/);
});
await test('the scoped server still uses canonical CAS writes, not /kv mutations',async()=>{
 assert.match(server,/const result=await rosterWriteEmployeesServer\(env,actor,intent\)/);
 assert.match(server,/firebaseAdminSetIfMatch\(env, WORKFORCE_ROSTER_EMPLOYEE_PATH, next, observed\.etag\)/);
});
console.log(`M2964: ${count} scoped single-TL-transfer security tests passed.`);
