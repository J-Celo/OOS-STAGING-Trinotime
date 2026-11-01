import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planAdminTlDirectoryVerification,AdminRosterAddError} from '../src/admin-roster-add.js';
const state={policy:{secureReadsEnabled:true,allowLegacyFallback:true},
 employees:{verified:true,version:'canonical-286',entries:[{name:'Existing Agent',pod:'POD 2'},{name:'QA Agent',pod:'OOS Coverage Beta QAs',role:'qa'}]},
 podDirectory:{verified:true,entries:[{id:'POD 0'},{id:'POD 1'},{id:'POD 2'},{id:'OOS Coverage Beta QAs'}]},
 teamLeaderDirectory:{verified:false,source:'legacy-kv',revision:7,entries:[{name:'TL First',pod:'POD 0',active:true},{name:'TL Second',pod:'POD 1',active:true}]}};
const legacy={revision:7,entries:structuredClone(state.teamLeaderDirectory.entries)};
const clone=x=>structuredClone(x);
const plan=planAdminTlDirectoryVerification(state,legacy,null);
assert.equal(plan.entries.length,2);assert.equal(plan.revision,7);
assert.deepEqual(state.teamLeaderDirectory.entries,legacy.entries);
assert.deepEqual(planAdminTlDirectoryVerification(state,legacy,clone(legacy)).entries,legacy.entries);
function reject(code,s=state,l=legacy,d=null){assert.throws(()=>planAdminTlDirectoryVerification(s,l,d),e=>e instanceof AdminRosterAddError&&e.code===code);}
let q=clone(state);q.teamLeaderDirectory.verified=true;reject('ROSTER_TL_VERIFICATION_BLOCKED',q);
q=clone(state);q.policy.secureReadsEnabled=false;reject('ROSTER_TL_VERIFICATION_BLOCKED',q);
q=clone(state);q.teamLeaderDirectory.source='defaults';reject('ROSTER_TL_VERIFICATION_BLOCKED',q);
q=clone(state);q.employees.verified=false;reject('ROSTER_TL_VERIFICATION_BLOCKED',q);
q=clone(state);q.podDirectory.verified=false;reject('ROSTER_TL_VERIFICATION_BLOCKED',q);
q=clone(legacy);q.entries=[];reject('ROSTER_TL_VERIFICATION_CONFLICT',state,q);
q=clone(legacy);q.entries.push({name:'Other',pod:'POD 2',active:true});reject('ROSTER_TL_VERIFICATION_CONFLICT',state,q);
q=clone(legacy);q.entries[0].name='Existing Agent';let a=clone(state);a.teamLeaderDirectory.entries=clone(q.entries);reject('ROSTER_TL_VERIFICATION_CONFLICT',a,q);
q=clone(legacy);q.entries[0].pod='OOS Coverage Beta QAs';a=clone(state);a.teamLeaderDirectory.entries=clone(q.entries);reject('ROSTER_TL_VERIFICATION_CONFLICT',a,q);
q=clone(legacy);q.entries[1].name=q.entries[0].name;a=clone(state);a.teamLeaderDirectory.entries=clone(q.entries);reject('ROSTER_TL_VERIFICATION_CONFLICT',a,q);
q=clone(legacy);q.entries[1].pod=q.entries[0].pod;a=clone(state);a.teamLeaderDirectory.entries=clone(q.entries);reject('ROSTER_TL_VERIFICATION_CONFLICT',a,q);
reject('ROSTER_TL_VERIFICATION_CONFLICT',state,legacy,{revision:7,entries:[{name:'Other',pod:'POD 0',active:true}]});
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf-8');
const client=fs.readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js',import.meta.url),'utf-8');
assert.match(worker,/rosterVerifyTlDirectoryForAdminAddServer/);
assert.match(worker,/firebaseAdminGetWithEtag\(env,WORKFORCE_ROSTER_TL_PATH\)/);
assert.match(worker,/firebaseAdminSetIfMatch\(env,WORKFORCE_ROSTER_TL_PATH,next,observed.etag\)/);
assert.match(worker,/if\(committed.preconditionFailed\)fail\(409/);
assert.match(worker,/if\(state.teamLeaderDirectory\?\.verified!==true\)state=await rosterVerifyTlDirectoryForAdminAddServer/);
assert.match(client,/if\(before\?\.employees\?\.verified!==true\|\|before\?\.podDirectory\?\.verified!==true\)/);
assert.doesNotMatch(client,/before\?\.teamLeaderDirectory\?\.verified!==true/);
assert.match(worker,/if\(!got\|\|got.verified!==true/);
console.log('PASS UX18P31: TL legacy/canonical agreement, verified employee/POD authority, QA/TL collisions, protected CAS, client submits to server for safe one-time verification.');
// Execute the actual server TL verification function in an isolated VM with
// synthetic Firebase ETag and legacy records. No network access or real data.
import vm from 'node:vm';
const begin=worker.indexOf('async function rosterVerifyTlDirectoryForAdminAddServer(');
const end=worker.indexOf('// UX18P30: Admin adds one Agent',begin);
assert(begin>0&&end>begin,'server verification extraction anchors');
function harness({etag='etag-a',stored=null,legacyMismatch=false,preconditionFailed=false,readBackFault=false}={}){
 const fixture=clone(state);let canonical=stored?clone(stored):null;
 const legacyRaw=JSON.stringify({revision:7,entries:legacyMismatch?[{name:'Wrong TL',pod:'POD 0',active:true}]:clone(legacy.entries)});
 const effects={writeCalls:0,fetchCalls:0,cacheInvalidations:0,events:[]};
 const c=vm.createContext({crypto:{randomUUID:()=> 'fake-uuid'},JSON,Date,Set,String,Number,
  planAdminTlDirectoryVerification,
  directoryCache:{at:100,members:['existing']},
  safeIso:()=> '2026-10-29T02:00:00.000Z',RELEASE:'test',WORKFORCE_ROSTER_TL_PATH:'secure/tl',
  fail:(status,code,message)=> {throw Object.assign(new Error(message),{status,code})},
  rosterDocVerifiedServer:d=>d?.verified===true,
  rosterLegacyRawServer:async()=>legacyRaw,
  rosterNormalizeTlDirectoryServer:(raw)=>JSON.parse(raw),
  parseJsonString:(raw,fallback)=>{try{return JSON.parse(raw)}catch{return fallback}},
  firebaseAdminGetWithEtag:async()=>{effects.fetchCalls++;return {value:canonical,etag}},
  firebaseAdminSetIfMatch:async(_,path,payload,mustMatch)=>{effects.writeCalls++;assert.equal(path,'secure/tl');assert.equal(mustMatch,'etag-a');effects.events.push(payload);if(preconditionFailed)return {preconditionFailed:true};canonical=clone(payload);return {value:readBackFault?{...payload,verified:false}:canonical}},
  firebaseAdminGet:async()=>canonical,
  rosterResolvedStateServer:async()=>({...fixture,teamLeaderDirectory:canonical?{...canonical,source:undefined}:fixture.teamLeaderDirectory}),
  invalidateWorkforceAuthorizationCacheServer:()=>{effects.cacheInvalidations++}
 });
 vm.runInContext(worker.slice(begin,end)+'\nglobalThis.verify=rosterVerifyTlDirectoryForAdminAddServer;',c);
 return {c,effects,fixture};
}
let h=harness();let ok=await h.c.verify({}, {role:'admin',uid:'test-admin'},h.fixture);
assert.equal(ok.teamLeaderDirectory.verified,true);assert.equal(ok.teamLeaderDirectory.entries.length,2);
assert.equal(h.effects.writeCalls,1);assert.equal(h.effects.cacheInvalidations,1);
assert.equal(h.effects.events[0].verifiedByUid,'test-admin');
assert.deepEqual(JSON.parse(JSON.stringify(h.effects.events[0].entries)),legacy.entries,'verified TL list must be byte-for-byte semantically identical');
h=harness({preconditionFailed:true});await assert.rejects(h.c.verify({}, {role:'admin',uid:'test-admin'},h.fixture),e=>e.code==='ROSTER_TL_VERIFICATION_CONFLICT');
assert.equal(h.effects.writeCalls,1);assert.equal(h.effects.cacheInvalidations,0);
h=harness({etag:''});await assert.rejects(h.c.verify({}, {role:'admin',uid:'test-admin'},h.fixture),e=>e.code==='ROSTER_TL_ETAG_REQUIRED');assert.equal(h.effects.writeCalls,0);
h=harness({legacyMismatch:true});await assert.rejects(h.c.verify({}, {role:'admin',uid:'test-admin'},h.fixture),e=>e.code==='ROSTER_TL_VERIFICATION_CONFLICT');assert.equal(h.effects.writeCalls,0);
h=harness({stored:{revision:7,entries:[{name:'Secure Different TL',pod:'POD 0',active:true}]}});await assert.rejects(h.c.verify({}, {role:'admin',uid:'test-admin'},h.fixture),e=>e.code==='ROSTER_TL_VERIFICATION_CONFLICT');assert.equal(h.effects.writeCalls,0);
h=harness({readBackFault:true});await assert.rejects(h.c.verify({}, {role:'admin',uid:'test-admin'},h.fixture),e=>e.code==='ROSTER_TL_VERIFICATION_READBACK_FAILED');assert.equal(h.effects.cacheInvalidations,0);
console.log('PASS UX18P31 runtime: narrow TL-only CAS success, ETag missing, write race, mismatch, readback invalid, no-unverified-writes fail closed.');
