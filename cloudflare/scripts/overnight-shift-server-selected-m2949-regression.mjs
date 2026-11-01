import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8');
const coverage=fs.readFileSync(path.join(root,'public/assets/js/j-coverage-dashboard-rc20.js'),'utf8');
const confirmation=fs.readFileSync(path.join(root,'public/assets/js/j-confirmation-dashboard-rc21.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const isolate=(start,end)=>{
  const a=worker.indexOf(start),b=worker.indexOf(end,a+start.length);
  assert(a>0&&b>a,`Functions found: ${start}`);
  return worker.slice(a,b);
};
const code=isolate('function trackerDashboardAttendanceEvidenceServer(', 'function coverageDashboardRowServer(')
  +isolate('async function trackerDashboardDateSelectionServer(', 'async function coverageAgentDetailServer(')
  +isolate('async function confirmationDashboardServer(', 'async function confirmationAgentDetailServer(')
  +'\nglobalThis.runCoverage=coverageDashboardServer;globalThis.runConfirmation=confirmationDashboardServer;globalThis.dateSelection=trackerDashboardDateSelectionServer;';
const today='2026-10-09',prior='2026-10-08',agent='Inosuke Hashibira';
let actor={role:'agent',name:agent,pod:'pod13'};
let shift={status:'active',sessionId:'oct8-shift',reportDate:prior};
const getAgent=()=>[{name:agent,pod:'pod13'}];
const reads=[];
const counts={
 [`cov/${prior}`]:{[agent.toLowerCase()]:{name:agent,submitted:26,submittedDisplayTotal:26,serverUpdatedAtMs:1791480000000}},
 [`conf/${prior}`]:{[agent.toLowerCase()]:{name:agent,submitted:12,submittedDisplayTotal:12,interval1:4,interval2:4,interval3:4,serverUpdatedAtMs:1791480000000}},
};
const c={
 URL,Date,Math,Number,Promise,String,console,
 credentialRole:v=>v,
 cleanText:(v,n)=>String(v||'').slice(0,n),
 manilaDateKeyServer:()=>today,
 trackerShiftResolveForActorServer:async()=>shift,
 requireWorkforceAttendanceActor:async()=>actor,
 coverageAssertExpectedViewerServer:()=>{},confirmationAssertExpectedViewerServer:()=>{},
 coverageDateKeyServer:d=>d,confirmationDateKeyServer:d=>d,
 coverageVisibleAgentsServer:async()=>({state:{podDirectory:{}},agents:getAgent()}),
 confirmationVisibleAgentsServer:async()=>({state:{podDirectory:{}},agents:getAgent()}),
 firebaseAdminGet:async(_,key)=>{reads.push(key);return counts[key]||null;},
 WORKFORCE_COVERAGE_DAILY_PATH:'cov',WORKFORCE_CONFIRMATION_DAILY_PATH:'conf',WORKFORCE_TRACKER_SHIFT_CURRENT_PATH:'shift-current',
 coverageActorKeyServer:(_,name)=>name.toLowerCase(),confirmationActorKeyServer:(_,name)=>name.toLowerCase(),
 coverageDashboardRowServer:(agent,data)=>({...agent,...(data||{}),connected:Boolean(data)}),
 confirmationDashboardRowServer:(agent,data)=>({...agent,...(data||{}),connected:Boolean(data)}),
 coveragePodLabelServer:()=> 'POD 13',confirmationPodLabelServer:()=> 'POD 13',
 coveragePodSortServer:(a,b)=>String(a).localeCompare(String(b)),
 confirmationPodSortServer:(a,b)=>String(a).localeCompare(String(b)),
 trackerLiveReportDateForDashboardServer:async()=> '',
 coverageViewerRoleServer:v=>v,confirmationViewerRoleServer:v=>v,
};
vm.runInNewContext(code,c,{filename:'dashboard-server-selected-M2.9.49'});
const req={},url=q=>new URL(`https://staging.example.test/api/workforce/dashboard?${q}`);
let result=await c.runCoverage(req,{},url(`date=${today}&followActiveShift=1`));
assert.equal(result.date,prior,'server returns date actually loaded');
assert.equal(result.requestedDate,today,'reports original requested date');
assert.equal(result.dateSource,'authenticated-active-shift');
assert.equal(result.totals.submitted,26,'Coverage totals read from original shift date');
assert(reads.includes(`cov/${prior}`),'Coverage reads shift-day data from server');
result=await c.runConfirmation(req,{},url(`date=${today}&followActiveShift=1`));
assert.equal(result.date,prior);
assert.equal(result.totals.submitted,12,'Confirmation totals read from original shift date');
assert.equal(result.totals.interval1,4,'interval values remain separate');
assert(reads.includes(`conf/${prior}`),'Confirmation reads shift-day data from server');
result=await c.runCoverage(req,{},url(`date=${today}&followActiveShift=0`));
assert.equal(result.date,today,'manual dates not overridden');
assert.equal(result.totals.submitted,0,'manual date does not blend records');
assert.equal(result.dateSource,'selected-date');
actor={role:'team_leader',name:'Leader',pod:'pod13'};
result=await c.runCoverage(req,{},url(`date=${today}&followActiveShift=1`));
assert.equal(result.date,today,'Team Lead may not claim Agent shift auto date');
actor={role:'admin',name:'Administrator',pod:''};
result=await c.runConfirmation(req,{},url(`date=${today}&followActiveShift=1`));
assert.equal(result.date,today,'Admin has no automatic Agent shift selection');
actor={role:'agent',name:agent,pod:'pod13'};
shift={status:'completed',sessionId:'oct8-shift',reportDate:prior};
result=await c.runCoverage(req,{},url(`date=${today}&followActiveShift=1`));
assert.equal(result.date,today,'completed shifts not shown as live');
shift={status:'active',sessionId:'old-shift',reportDate:'2026-10-01'};
result=await c.runCoverage(req,{},url(`date=${today}&followActiveShift=1`));
assert.equal(result.date,today,'old shift cannot override current period');
// User clocks out a shift they forgot to close, then clocks in for a new day.
shift={status:'active',sessionId:'oct9-new-shift',reportDate:today};
result=await c.runCoverage(req,{},url(`date=${prior}&followActiveShift=1`));
assert.equal(result.date,today,'newly clocked-in shift switches to the new report date');
assert.equal(result.totals.submitted,0,'prior shift counts never leak into the new shift day');
shift={status:'completed',sessionId:'oct9-new-shift',reportDate:today};
result=await c.runCoverage(req,{},url(`date=${today}&followActiveShift=1`));
assert.equal(result.date,today,'clocked-out shift no longer governs dashboard day');
assert(coverage.includes('followActiveShift=${a.role===\'agent\'&&state.followShift?\'1\':\'0\'}'),'Coverage requests single-shot server shift resolution');
assert(coverage.includes('state.followShift?phtDate():state.date'),'Coverage follow mode falls back to actual current day');
assert(coverage.includes('if(state.followShift && dashboard.date && dashboard.date!==state.date)'),'Coverage honors loaded response date');
assert(confirmation.includes("'&followActiveShift='"),'Confirmation uses single-shot server shift resolution');
assert(confirmation.includes('followShift?phtDate():date'),'Confirmation follow mode falls back to actual current day');
assert(confirmation.includes('if(followShift && d.date && d.date!==date)'),'Confirmation honors loaded response date');
assert(index.includes('overnight-shift-m2949=1'),'new assets cache busted');
console.log('PASS M2.9.49: Coverage and Confirmation auto-load authenticated Oct 8 records on Oct 9 in ONE server response.');
console.log('PASS M2.9.49: manual historical dates, TL/Admin isolation, completed/old shift refusal, and asset references.');
