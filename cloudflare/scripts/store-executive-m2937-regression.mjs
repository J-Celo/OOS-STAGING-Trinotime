import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const worker=read('src/worker.js');
const panel=read('public/assets/js/j-store-intelligence-m2934.js');
const exports=read('public/assets/js/j-report-exports-m2935.js');
const css=read('public/assets/css/c-store-intelligence-m2934.css');
const request=(role,name,pod)=>({actor:{role,name,pod},headers:new Headers()});
const context=vm.createContext({URL,Headers,Request,Response,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,structuredClone,createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
requireWorkforceAttendanceActor=async req=>req.actor;
coverageVisibleAgentsServer=async (env,actor)=>({agents:actor.role==='admin'?env.agents:actor.role==='team_leader'?env.agents.filter(a=>a.pod===actor.pod):env.agents.filter(a=>a.name===actor.name)});
coverageActorKeyServer=(role,name)=>name.toLowerCase();
firebaseAdminGet=async (env,path)=>env.data[path]||null;
globalThis.storeTest=storeIntelReportServer;`,context);
const date='2026-10-08',one='2026-10-07',older='2026-10-06';
const agent='Zenitsu Agatsuma',pod='pod1';
const row=(id,store,submitted,stamp,other={})=>({name:agent,pod,jobId:id,storeName:store,submitted,activeMs:submitted*60000,lastSeenAt:stamp,...other});
const env={agents:[{name:agent,pod},{name:'Kanao Tsuyuri',pod:'pod2'}],data:{
 [`workforceCoverage/v1/jobs/${older}`]:{[agent.toLowerCase()]:{
  a:row('JOB_10001','Preston',2,100),b:row('JOB_10002','Miranda',3,100)}},
 [`workforceCoverage/v1/jobs/${one}`]:{[agent.toLowerCase()]:{
  a:row('JOB_10001','Preston',4,300),d:row('JOB_10004','Preston',2,300)}},
 [`workforceCoverage/v1/jobs/${date}`]:{[agent.toLowerCase()]:{
  // Latest corrected same-day snapshot wins, not additive. One ID appears twice.
  a:row('JOB_10001','Preston',5,1000),aRepeat:row('JOB_10001','Preston',6,2000),
  b:row('JOB_10002','Miranda',2,1000),
  // Conflicting observation cannot be silently assigned to Preston or Miranda.
  c:row('JOB_10003','Preston',1,1000),cConflict:row('JOB_10003','Miranda',4,2000)}},
 [`workforceConfirmation/v1/jobs/${date}`]:{[agent.toLowerCase()]:{
  a:row('JOB_10001','Preston',1,1000)}},
}};
const url=(type,period='day')=>new URL(`https://example.com/api/workforce/${type}/stores?date=${date}&period=${period}`);
const req=request('agent',agent,pod);
const daily=await context.storeTest(req,env,url('coverage'),'coverage');
assert.equal(daily.period,'day');
assert.equal(daily.jobs.length,3,'duplicate job snapshot reduced to one job row');
assert.equal(daily.jobs.find(j=>j.jobId==='JOB_10001').submitted,6,'freshest job state wins (6), not 5+6');
assert.equal(daily.conflictJobs,1,'conflicting observed stores flagged');
assert.equal(daily.jobs.find(j=>j.jobId==='JOB_10003').mappingStatus,'conflict','store conflict not silently assigned');
assert.equal(daily.stores.find(s=>s.storeName==='Preston').submitted,6,'Preston counts unaffected by conflicting job');
assert.equal(daily.stores.find(s=>s.storeName==='Miranda').submitted,2,'Miranda counts unaffected by conflicting job');
const week=await context.storeTest(req,env,url('metrics','7d'),'metrics');
assert.equal(week.period,'7d');
assert.equal(week.fromDate,'2026-10-02');
const preston=week.stores.find(s=>s.workflow==='coverage'&&s.storeName==='Preston');
assert.equal(preston.jobs,2,'revisited job IDs count once across the period, new job adds one');
assert.equal(preston.submitted,14,'revisited Preston activity accumulates its daily 2+4+6+2');
assert.equal(preston.paceSec,60,'derived active seconds per confirmed submission is accurate');
assert.equal(week.trends.filter(t=>t.storeName==='Preston'&&t.workflow==='coverage').length,3,'three Preston dates retained in trend');
assert.equal(week.jobs.filter(j=>j.jobId==='JOB_10001'&&j.workflow==='coverage').length,3,'same job on distinct dates preserved for history');
assert.equal(week.stores.find(s=>s.workflow==='confirmation').submitted,1,'Confirmation remains separate');
const crossDateEnv={agents:[{name:agent,pod}],data:{
 [`workforceCoverage/v1/jobs/${one}`]:{[agent.toLowerCase()]:{a:row('JOB_99999','Preston',2,10)}},
 [`workforceCoverage/v1/jobs/${date}`]:{[agent.toLowerCase()]:{b:row('JOB_99999','Miranda',3,20)}}
}};
const cross=await context.storeTest(req,crossDateEnv,url('coverage','7d'),'coverage');
assert.equal(cross.conflictJobs,2,'cross-date contradictory store mapping quarantines both daily job rows');
assert(cross.stores.every(s=>s.storeName==='Needs review'),'cross-date conflict must not count as Preston or Miranda');
const forbidden=await context.storeTest(request('agent','Kanao Tsuyuri','pod2'),env,url('metrics','7d'),'metrics');
assert.equal(forbidden.jobs.length,0,'another Agent cannot see scoped job records');
await assert.rejects(context.storeTest(req,env,url('coverage','365d'),'coverage'),'unsupported period denied');
await assert.rejects(context.storeTest(request('team_leader','Leader',pod),env,new URL(`https://example.com/api/workforce/coverage/stores?date=${date}&period=7d&pod=pod2`),'coverage'),'cross-POD denied');
assert(panel.includes('data-tt-store-period')&&panel.includes('data-tt-si-toggle')&&panel.includes('data-tt-store-search'),'expandable/searchable date-range store UX');
assert(panel.includes('getReportData:')&&exports.includes('TrinoTimeStoreIntelligence?.getReportData'),'reports read scoped store data independently of collapsed UI');
assert(exports.includes("name:'Store Trends'")||exports.includes("shape('Store Trends'"),'Excel/CSV/PDF include Store Trends sheet');
assert(css.includes('tt-si-store-card')&&css.includes('body.dark-mode .tt-si-store-card'),'light/dark store cards styled');
console.log('PASS M2.9.37 — latest snapshot dedup; conflicting stores held for review; Preston→Miranda→Preston visits; 7-day per-store workload/pace; workflow and POD isolation; expandable UI and complete report data.');
