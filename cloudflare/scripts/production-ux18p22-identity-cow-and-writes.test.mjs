// UX18P22, offline only: no network, credentials or live production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {planIdentityRename as optimized} from '../src/identity-rename-plan.js';
const enc=s=>Buffer.from(String(s)).toString('base64url');
const dec=s=>Buffer.from(s,'base64url').toString();
const oldName='Synthetic Agent',newName='Updated Agent',pod='POD 9',op='ux18p22-test-operation';
const root={
  roles:{'admin-test':{role:'admin',active:true},'agent-test':{role:'agent',name:oldName,pod}},
  workforceRoster:{v1:{employees:{verified:true,entries:[{employeeId:'stable-uid-111',name:oldName,pod,active:true}],version:'old'},teamLeaderDirectory:{verified:true,entries:[{name:'Leader Nine',pod}]},podDirectory:{verified:true,entries:[{id:pod}]}}},
  securityConfig:{credentialVault:{mode:'vault-only'}},
  secureCredentials:{agent:{[enc(oldName.toLowerCase())]:{active:true,hash:'synthetic-hash',salt:'synthetic-salt'}}},
  workforceAttendance:{v1:{records:{[enc(`att:10/28/2026|${oldName}`)]:JSON.stringify({name:oldName,pod,minutes:120})}}},
  workforceLeave:{v1:{requests:{r1:{agentName:oldName,pod}}}},
  workforceProfiles:{v1:{records:{[enc(`agent:${oldName.toLowerCase()}`)]:{agentName:oldName,about:'hello'}}}},
  kv:{[enc('employees')]:JSON.stringify([{employeeId:'stable-uid-111',name:oldName,pod}])},
  // Unrelated large and nested branches must not be copied or edited.
  unrelatedArchive:{records:Object.fromEntries(Array.from({length:600},(_,i)=>['event-'+i,{message:'irrelevant'.repeat(120),day:i}]))},
  workforceMetrics:{v1:{records:{same:{value:100,pod}}}}
};
const opts={actor:{role:'admin',uid:'admin-test',name:'Administrator'},oldName,newName,pod,operationId:op,actorBinding:'test-actor-binding',now:'2026-10-28T00:00:00Z',encode:enc,decode:dec};
const pristine=structuredClone(root);
const result=optimized(root,opts);
assert.equal(result.committedReceipt.newName,newName);
assert.equal(result.committedReceipt.state,'committed');
assert.equal(result.next.workforceRoster.v1.employees.entries[0].name,newName);
assert.equal(result.next.workforceLeave.v1.requests.r1.agentName,newName);
assert.equal(JSON.parse(Object.values(result.next.workforceAttendance.v1.records)[0]).name,newName);
assert.deepEqual(root,pristine,'Planning must never change input snapshot');
assert.equal(result.next.unrelatedArchive,root.unrelatedArchive,'No copy of unrelated large archive');
assert.equal(result.next.workforceMetrics,root.workforceMetrics,'Unchanged metrics branch must retain reference');
assert.notEqual(result.next.workforceAttendance,root.workforceAttendance,'Changed attendance branch must copy');
assert.equal(result.next.workforceRoster.v1.employees.entries[0].employeeId,'stable-uid-111');
assert.equal(result.next.secureCredentials.agent[enc(oldName.toLowerCase())].active,false);
console.log('PASS immutable copy-on-write preserves rename, credentials, attendance and unrelated history');

const code=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const start=code.indexOf('async function firebaseAdminSet(env, path, value)');
const end=code.indexOf('// UX18P21:',start);
assert(start>0 && end>start);
const context={URL,Request,Response,Headers,console};vm.createContext(context);
context.fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
context.getGoogleAccessToken=async()=> 'synthetic-token';
const requests=[];
context.fetch=async(url,init)=>{requests.push({url,init});return {ok:true,status:204,json(){throw Error('Firebase echo should never be parsed');}};};
vm.runInContext(code.slice(start,end),context);
const set=vm.runInContext('firebaseAdminSet',context);
const patch=vm.runInContext('firebaseAdminPatch',context);
const env={FIREBASE_DATABASE_URL:'https://synthetic.invalid/'};
assert.equal(await set(env,'workforceAttendance/v1',{large:'x'.repeat(1024)}),null);
assert.equal(await patch(env,'',{'workforceRoster/v1/employees':{verified:true}}),null);
assert.equal(requests[0].url,'https://synthetic.invalid/workforceAttendance/v1.json?print=silent');
assert.equal(requests[1].url,'https://synthetic.invalid/.json?print=silent');
assert.equal(requests[0].init.method,'PUT');assert.equal(requests[1].init.method,'PATCH');
context.fetch=async()=>({ok:false,status:503,body:{cancel:async()=>{}},json(){throw Error('Error response unexpectedly parsed');}});
await assert.rejects(set(env,'x',{}),e=>e.code==='PREMIUM_ENTITLEMENT_WRITE_FAILED');
await assert.rejects(patch(env,'x',{}),e=>e.code==='SECURITY_FIREBASE_WRITE_FAILED');
console.log('PASS Firebase PUT/PATCH acknowledgements no longer echo large payloads and reject failed writes');
console.log('2/2 UX18P22 focused memory tests passed');
