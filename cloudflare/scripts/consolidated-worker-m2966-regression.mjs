// Exercise the actual Worker route and CAS implementation against synthetic storage.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import { mergeRosterIntents } from '../src/roster-intents.js';
import { scopeRosterSnapshotM2962,redactRosterSecretsM2966,preserveRosterSecretsM2966 } from '../src/scoped-roster-m2962.js';
import { scopedRosterPatchReceiptM2963,scopedRosterEmployeePatchM2963 } from '../src/scoped-roster-patch-m2963.js';
import { workspaceReadModel } from '../src/workspace-read-model.js';
const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const code=source.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'').replace('export class ChatRealtimeHub','class ChatRealtimeHub').replace('export default {','const workerEntry = {');
const context={console,TextEncoder,TextDecoder,URL,Request,Response,Headers,crypto:webcrypto,atob,btoa,setTimeout,clearTimeout,structuredClone,mergeRosterIntents,scopeRosterSnapshotM2962,redactRosterSecretsM2966,preserveRosterSecretsM2966,scopedRosterPatchReceiptM2963,scopedRosterEmployeePatchM2963,workspaceReadModel,createRemoteJWKSet:()=>({})};
vm.createContext(context);vm.runInContext(code,context);
const readWrapper=context.firebaseAdminGet;
const actor={role:'team_leader',name:'Leader',pod:'Demon Slayer',uid:'tl'};
const state={employees:{verified:true,version:'v1',entries:[{name:'One',pod:'Demon Slayer',employeeId:'1',active:true,salary:123},{name:'Two',pod:'Demon Slayer',employeeId:'2',active:true},{name:'Outside',pod:'Solo Leveling',employeeId:'3',active:true,salary:999}]},podDirectory:{verified:true,entries:[{id:'Demon Slayer',name:'Demon Slayer',team:'CWH',active:true},{id:'Solo Leveling',name:'Solo Leveling',team:'CWH',active:true}]},teamLeaderDirectory:{verified:true,entries:[{name:'Leader',pod:'Demon Slayer',active:true}]}};
let current=structuredClone(state.employees),writes=0,race=false,auth=actor;
Object.assign(context,{
 requireWorkforceAttendanceActor:async()=>{if(!auth)throw Object.assign(Error('denied'),{status:401});return auth;},
 rosterResolvedStateServer:async()=>({...state,employees:structuredClone(current)}),
 firebaseAdminGetWithEtag:async()=>({value:structuredClone(current),etag:'"etag-v1"'}),
 firebaseAdminSetIfMatch:async(_env,_path,next)=>{writes++;if(race){current={...current,version:'concurrent'};return {preconditionFailed:true,value:current};}current=structuredClone(next);return {value:structuredClone(current)};},
 firebaseAdminGet:async()=>structuredClone(current),
 bestEffortRosterPostCommitServer:async()=>({legacyMirrored:true}),
 achievementMarkRosterChangesDirtyServer:async()=>{},invalidateWorkforceAuthorizationCacheServer:()=>{}
});
const reset=()=>{current=structuredClone(state.employees);writes=0;race=false;auth=actor;};
const request=(path,method='GET',body)=>new Request('https://staging.test/api/workforce/roster/'+path,{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
const invoke=async(path,method,body)=>{const req=request(path,method,body);return (await context.handleWorkforceRosterApi(req,{},new URL(req.url))).json();};
const intent=ops=>({operations:ops,baseVersion:'v1',targetVersion:'v2',mutationId:'v2'});
let count=0;const test=async(label,fn)=>{reset();await fn();count++;console.log('PASS Worker M2966:',label);};
await test('legacy snapshot routes through actual own-POD authorization',async()=>{const result=await invoke('snapshot');assert.equal(result.employees.entries.length,2);assert(!JSON.stringify(result).includes('Outside'));assert.equal(writes,0);});
await test('Agent actual snapshot strips coworker private data',async()=>{auth={role:'agent',name:'Two',pod:'Demon Slayer'};const result=await invoke('snapshot');assert(!('salary'in result.employees.entries.find(e=>e.name==='One')));});
await test('Admin actual snapshot retains all authorized PODs',async()=>{auth={role:'admin'};const result=await invoke('snapshot');assert.equal(result.employees.entries.length,3);});
await test('no actor cannot read snapshot',async()=>{auth=null;await assert.rejects(invoke('snapshot'));assert.equal(writes,0);});
await test('TL legacy PUT is rejected before write',async()=>{await assert.rejects(invoke('employees','PUT',{entries:state.employees.entries,baseVersion:'v1',targetVersion:'v2'}),e=>e.code==='ROSTER_INTENTS_REQUIRED');assert.equal(writes,0);});
await test('actual batch transfer commits once using canonical CAS',async()=>{const result=await invoke('employees/intents','PATCH',intent([{operation:'transfer',targetName:'One',newPod:'Solo Leveling'},{operation:'transfer',targetName:'Two',newPod:'Solo Leveling'}]));assert.equal(result.remoteSaved,true);assert.equal(writes,1);assert.equal(current.entries[0].pod,'Solo Leveling');assert.equal(current.entries[0].salary,123);assert.deepEqual(current.entries[2],state.employees.entries[2]);assert.equal(result.document.entries.length,0);assert(!JSON.stringify(result).includes('Outside'));});
await test('split roster-only self rename is rejected; full lifecycle suite covers authorized rename',async()=>{auth={role:'agent',name:'One',pod:'Demon Slayer'};await assert.rejects(invoke('employees/intents','PATCH',intent([{operation:'rename',targetName:'One',newName:'New One'}])),e=>e.code==='IDENTITY_TRANSACTION_REQUIRED');assert.equal(writes,0);assert.deepEqual(current.entries,state.employees.entries);});
await test('actual TL addition preserves all existing records',async()=>{const result=await invoke('employees/intents','PATCH',intent([{operation:'add',newName:'Added'}]));assert.equal(result.remoteSaved,true);assert.equal(current.entries.length,4);assert.deepEqual(current.entries.slice(0,3),state.employees.entries);});
await test('actual stale intent returns conflict and writes nothing',async()=>{const result=await invoke('employees/intents','PATCH',{...intent([{operation:'remove',targetName:'Two'}]),baseVersion:'old'});assert.equal(result.conflict,true);assert.equal(writes,0);assert(!result.document);});
await test('actual simultaneous CAS change never overwrites the newer version',async()=>{race=true;const result=await invoke('employees/intents','PATCH',intent([{operation:'remove',targetName:'Two'}]));assert.equal(result.conflict,true);assert.equal(current.version,'concurrent');assert.equal(current.entries.length,3);assert(!JSON.stringify(result).includes('Outside'));});
await test('actual unverified roster cannot accept intents',async()=>{current.verified=false;await assert.rejects(invoke('employees/intents','PATCH',intent([{operation:'remove',targetName:'Two'}])));assert.equal(writes,0);});
await test('actual cross-POD mutation cannot write',async()=>{await assert.rejects(invoke('employees/intents','PATCH',intent([{operation:'remove',targetName:'Outside'}])));assert.equal(writes,0);});
await test('Admin save preserves hidden fields while response stays redacted',async()=>{auth={role:'admin',uid:'admin'};current.entries[0].passwordHash='KEEP_HIDDEN';current.entries[0].nested={api_key:'KEEP_NESTED',visible:'old'};const entries=redactRosterSecretsM2966(current.entries);entries[0].salary=456;const result=await invoke('employees','PUT',{entries,baseVersion:'v1',targetVersion:'v2',mutationId:'v2'});assert.equal(result.remoteSaved,true);assert.equal(current.entries[0].passwordHash,'KEEP_HIDDEN');assert.equal(current.entries[0].nested.api_key,'KEEP_NESTED');assert(!JSON.stringify(result).includes('KEEP_HIDDEN'));assert(!JSON.stringify(result).includes('KEEP_NESTED'));});
await test('POD/TL directory CAS preserves a concurrent update',async()=>{race=true;const result=await context.rosterCommitDirectoryServer({},'directory',current,{...current,revision:2});assert.equal(result.conflict,true);assert.equal(current.version,'concurrent');});
await test('directory compare rejects a stale observation before writing',async()=>{const result=await context.rosterCommitDirectoryServer({},'directory',{...current,entries:[]},{...current,revision:2});assert.equal(result.conflict,true);assert.equal(writes,0);});
Object.assign(context,{
 handleWorkforceAttendanceSnapshot:async()=>({records:{}}),collectResolvedOvertimeServer:async()=>({records:{},locks:{}}),
 collectResolvedScheduleServer:async()=>({dayOffSchedule:{},shiftSettings:{}}),collectResolvedLeaveRequestsServer:async()=>({records:{}}),
 personnelSpeedResolvedServer:async()=>({records:[]}),personnelCoachingResolvedServer:async()=>({records:[]}),
 handleGovernanceAnnouncementsGetServer:async()=>({entries:[]}),handleGovernanceNetworkGetServer:async()=>({settings:{}}),
 leaveHrReadPolicyServer:async()=>({policy:{}}),leaveHrReadProfilesServer:async()=>({}),leaveHrVisibleLedgerServer:async()=>[],
 handleProfileDirectoryList:async()=>({entries:[]}),readProfileStateServer:async()=>({raw:null})
});
const readRequest=()=>new Request('https://staging.test/api/workforce/workspace-read');
await test('actual combined read emits only authorized own-POD values',async()=>{const req=readRequest(),res=await context.handleWorkspaceReadModel(req,{},new URL(req.url)),result=await res.json();assert.equal(result.authority,'workforce-workspace-read-v1');assert(result.revision);assert(!JSON.stringify(result).includes('Outside'));assert.equal(writes,0);});
await test('actual combined read rejects unsigned caller',async()=>{auth=null;const req=readRequest();await assert.rejects(context.handleWorkspaceReadModel(req,{},new URL(req.url)));assert.equal(writes,0);});
await test('an upstream failure caught by a legacy service invalidates the whole snapshot',async()=>{context.firebaseAdminGet=readWrapper;context.firebaseAdminGetUncached=async()=>{throw Error('upstream unavailable');};context.personnelSpeedResolvedServer=async(env)=>{await context.firebaseAdminGet(env,'optional-speed').catch(()=>null);return {records:[]};};const req=readRequest();await assert.rejects(context.handleWorkspaceReadModel(req,{},new URL(req.url)),e=>e.code==='WORKSPACE_SNAPSHOT_INCOMPLETE');assert.equal(writes,0);});
await test('request-local reads coalesce but never leak cache across requests',async()=>{let reads=0;context.firebaseAdminGetUncached=async()=>{reads++;return {value:1};};context.personnelSpeedResolvedServer=async(env)=>{const [a,b]=await Promise.all([context.firebaseAdminGet(env,'same'),context.firebaseAdminGet(env,'same')]);a.value=2;assert.equal(b.value,1);return {records:[]};};for(let i=0;i<2;i++){const req=readRequest();await context.handleWorkspaceReadModel(req,{},new URL(req.url));}assert.equal(reads,2);});
console.log(`Worker M2966: ${count} real route/CAS integration scenarios passed against synthetic storage; no external connections.`);
