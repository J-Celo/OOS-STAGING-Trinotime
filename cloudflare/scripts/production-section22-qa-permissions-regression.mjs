import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {
 resolveOosCoverageBetaQas,buildOosQaActivation,oosQaManifestCurrent,oosQaActorAuthorized,oosQaAggregateByPod,
 OOS_COVERAGE_BETA_QA_DB_PATH,OOS_COVERAGE_BETA_QA_ACTIVATE_CONFIRM
} from '../src/oos-coverage-beta-qas.js';
const source=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const start=source.indexOf('async function handleGuardedOosQaTeamApi('),end=source.indexOf('\nexport default {',start);
assert.ok(start>0&&end>start);
const roster={employees:{verified:true,entries:[
 {name:'Jhan Roi Celo',pod:'POD 2',employeeId:'stable1',active:true},
 {name:'March sheen Jacildo',pod:'POD 0',employeeId:'stable2',active:true},
 {name:'Example Cabahug',pod:'POD 1',employeeId:'stable3',active:true}
]}};
let manifest=null, writes=0, actor={role:'admin',uid:'admin1',name:'Admin',pod:''};
const error=(status,code,message)=>Object.assign(new Error(message),{status,code});
const context=vm.createContext({
 URL,console,OOS_COVERAGE_BETA_QA_DB_PATH,OOS_COVERAGE_BETA_QA_ACTIVATE_CONFIRM,
 resolveOosCoverageBetaQas,buildOosQaActivation,oosQaManifestCurrent,oosQaActorAuthorized,oosQaAggregateByPod,
 requireWorkforceAttendanceActor:async()=>actor,rosterResolvedStateServer:async()=>roster,
 firebaseAdminGet:async(_env,path)=>path===OOS_COVERAGE_BETA_QA_DB_PATH?manifest:{},
 firebaseAdminGetWithEtag:async()=>({value:manifest,etag:'mock-etag'}),
 firebaseAdminSetIfMatch:async(_env,_path,value)=>{writes++;manifest=value;return {committed:true};},
 parseBody:async(req)=>req.mockBody||{},safeIso:()=> '2026-10-19T05:00:00.000Z',
 canonicalWorkforceAuthorizationRosterServer:async()=>({entries:{
 a:{role:'agent',name:'Jhan Roi Celo',pod:'POD 2',active:true},
 b:{role:'agent',name:'March sheen Jacildo',pod:'POD 0',active:true},
 c:{role:'agent',name:'Example Cabahug',pod:'POD 1',active:true}}}),
 rosterCleanNameServer:n=>n,cleanText:n=>n,credentialRole:n=>n,coverageDateKeyServer:n=>n,
 manilaDateKeyServer:()=> '2026-10-19',WORKFORCE_COVERAGE_DAILY_PATH:'workforceCoverage/v1/daily',
 WORKFORCE_CONFIRMATION_DAILY_PATH:'workforceConfirmation/v1/daily',coverageActorKeyServer:(_role,name)=>name,
 fail:(status,code,message)=>{throw error(status,code,message);},json:(data,status)=>({...data,_status:status})
});
vm.runInContext(source.slice(start,end)+'\nglobalThis.testRoute=handleGuardedOosQaTeamApi;',context);
const call=(route,method='GET',body,enabled=false)=>context.testRoute({method,mockBody:body},{DEPLOYMENT_ENV:'production',...(enabled?{ENABLE_OOS_QA_WORKGROUP:'true'}:{})},new URL('https://oos.trinotime.com/api/workforce/qa-team/'+route));
const denied=async(fn,code)=>assert.rejects(fn,e=>e.code===code);
await denied(()=>call('roster'),'OOS_QA_FEATURE_DISABLED');
await denied(()=>call('activate','POST',{confirm:OOS_COVERAGE_BETA_QA_ACTIVATE_CONFIRM}),'OOS_QA_FEATURE_DISABLED');
assert.equal(writes,0);
assert.equal((await call('roster','GET',null,true)).activated,false);
actor={role:'agent',uid:'qa1',name:'Jhan Roi Celo',pod:'POD 2'};
await denied(()=>call('activate','POST',{confirm:OOS_COVERAGE_BETA_QA_ACTIVATE_CONFIRM},true),'OOS_QA_ADMIN_REQUIRED');
await denied(()=>call('dashboard','GET',null,true),'OOS_QA_NOT_AUTHORIZED');
actor={role:'admin',uid:'admin1',name:'Admin',pod:''};
await denied(()=>call('activate','POST',{confirm:'invalid'},true),'OOS_QA_CONFIRM_REQUIRED');
roster.employees.entries.push({name:'Other Cabahug',pod:'POD 1',employeeId:'other',active:true});
await denied(()=>call('activate','POST',{confirm:OOS_COVERAGE_BETA_QA_ACTIVATE_CONFIRM},true),'OOS_QA_ROSTER_NOT_READY');
assert.equal(writes,0);
roster.employees.entries.pop();
const ok=await call('activate','POST',{confirm:OOS_COVERAGE_BETA_QA_ACTIVATE_CONFIRM},true);
assert.equal(ok.activated,true);assert.equal(ok.members,3);assert.equal(writes,1);
assert.equal((await call('activate','POST',{confirm:OOS_COVERAGE_BETA_QA_ACTIVATE_CONFIRM},true)).alreadyActive,true);
assert.equal(writes,1);
actor={role:'agent',uid:'qa1',name:'Jhan Roi Celo',pod:'POD 2'};
assert.equal((await call('roster','GET',null,true)).scope,'qa-member');
const board=await call('dashboard','GET',null,true);
assert.equal(board.pods.length,17);assert.equal(board.totals.agents,3);
actor={role:'team_leader',name:'TL',pod:'POD 2'};
await denied(()=>call('dashboard','GET',null,true),'OOS_QA_NOT_AUTHORIZED');
roster.employees.entries[0].employeeId='rotated-id';
actor={role:'agent',name:'Jhan Roi Celo',pod:'POD 2'};
await denied(()=>call('roster','GET',null,true),'OOS_QA_NOT_ACTIVE');
console.log('PASS — prod QA default-disabled; mock enable then unique-roster/Admin-only activation; idempotence; TL deny; roster-change revoke. No actual Firebase writes.');
