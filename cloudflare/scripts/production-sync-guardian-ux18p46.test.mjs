// Offline UX18P46 acceptance: synthetic Firebase only, no network or production writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {resolve} from 'node:path';
const cloud=resolve(import.meta.dirname,'..');
const source=readFileSync(resolve(cloud,'src/worker.js'),'utf8');
const client=readFileSync(resolve(cloud,'public/assets/js/j-v1191-admin-command-center.js'),'utf8');
const html=readFileSync(resolve(cloud,'public/index.html'),'utf8');
const css=readFileSync(resolve(cloud,'public/assets/css/c-v1192-consolidated-app.css'),'utf8');
const begin=source.indexOf('// UX18P46 — Sync Guardian V1.');
const end=source.indexOf('// ---- end Confirmation Activity Tracker / Dashboard v1',begin);
assert(begin>0&&end>begin,'New Sync Guardian server functions exist');
let checks=0;
const ok=(condition,msg)=>{assert(condition,msg);checks++;};
let allowAdmin=true;
let roster=[{name:'Agent A',pod:'POD 0',employeeId:'A'},{name:'Agent B',pod:'POD 1',employeeId:'B'},{name:'QA',pod:'QA',employeeId:'QA'}];
const now=Date.now();
let dates=['2026-10-31'];
let records={};
let failedRead=new Set();
let writes=0;
const fakeDate='2026-10-31';
const context={
  Date,Number,String,Math,Set,Map,Promise,
  manilaDateKeyServer:()=>fakeDate,
  requireFirebaseUser:async()=>({uid:'synthetic-admin'}),
  normalizeRole:(role)=>String(role||''),
  coverageVisibleAgentsServer:async(_env,actor)=>{ok(actor.role==='admin','Server uses own Admin identity');return {state:{podDirectory:{}},agents:roster};},
  qcMetricsActiveLabelerRosterServer:(agents)=>agents.filter(a=>a.employeeId!=='QA'),
  trackerDashboardAttendanceIndexServer:async()=>records.__shifts??{},
  coverageActorKeyServer:(_role,name)=>name.toLowerCase().replace(/\s/g,''),
  coveragePodLabelServer:(_dir,pod)=>pod,
  coveragePodSortServer:(a,b)=>String(a).localeCompare(String(b)),
  trackerDashboardAttendanceEvidenceServer:(shift,date)=>({attendanceStatus:shift?.status==='active'&&shift?.reportDate===date?'timed_in':shift?.status==='completed'?'timed_out':'unverified'}),
  firebaseAdminGet:async(_env,path)=>{if(path==='roles/synthetic-admin')return allowAdmin?{role:'admin',active:true}:{role:'agent',active:true};if(failedRead.has(path))throw new Error('mock read failure');return records[path]??{};},
  WORKFORCE_COVERAGE_DAILY_PATH:'cov/daily',WORKFORCE_CONFIRMATION_DAILY_PATH:'conf/daily',
  cleanText:(s,max)=>String(s||'').slice(0,max),
  fail:(status,code,message)=>{const err=new Error(message);err.status=status;err.code=code;throw err;},
  json:(data,status=200,headers={})=>({data,status,headers}),Response:class{constructor(_body,{status}={}){this.status=status;}},
};
runInNewContext(source.slice(begin,end),context);
const request=(method='GET')=>({method});
const endpoint=()=>context.handleWorkforceSyncGuardianApi(request(),{}, {pathname:'/api/workforce/sync-guardian/summary'});
const shift={status:'active',sessionId:'sh1',startedAt:'2026-10-31T01:00:00Z',reportDate:fakeDate,generation:2};
records.__shifts={agenta:shift,agentb:{...shift,status:'completed',endedAt:'2026-10-31T06:00:00Z'}};
records[`cov/daily/${fakeDate}`]={agenta:{submitted:9,serverUpdatedAtMs:now-1000,shiftSessionId:'sh1',shiftGeneration:2,extensionVersion:'2.3.11'}};
records[`conf/daily/${fakeDate}`]={agenta:{submitted:5,serverUpdatedAtMs:now-220000,shiftSessionId:'sh1',shiftGeneration:2,extensionVersion:'2.3.10'}};
let res=await endpoint();
ok(res.data.ok===true&&res.data.readOnly===true,'Read-only response');
ok(res.data.scope==='admin-only','No cross-role scope');
ok(res.data.agents.length===2,'Verified QA excluded');
ok(res.data.agents[0].coverage.status==='recent','Recent accepted Coverage');
ok(res.data.agents[0].confirmation.status==='stale','Stale accepted Confirmation');
ok(res.data.agents[0].coverage.confirmed===9,'Confirmed Coverage from accepted daily only');
ok(res.data.agents[0].coverage.localPending==='unknown','Never fabricate local pending');
ok(res.data.agents[0].coverage.version==='2.3.11','Last server acknowledged version');
ok(res.data.agents[1].coverage.status==='not-working','Completed shift not a live error');
ok(!('shiftSessionId' in res.data.agents[0])&&!('employeeId' in res.data.agents[0]),'No secure session/employee identifiers leaked');
ok(!('deviceId' in res.data.agents[0]),'No sensitive device IDs');
// A missing daily node cannot report successful or rejected submissions.
records[`cov/daily/${fakeDate}`]={};res=await endpoint();
ok(res.data.agents[0].coverage.status==='no-evidence','No ACK is not a fabricated failure');
ok(res.data.agents[0].coverage.confirmed===0,'No fabricated server-confirmed tasks');
// Shift mismatch cannot inherit a previous shift's submissions.
records[`cov/daily/${fakeDate}`]={agenta:{submitted:99,serverUpdatedAtMs:now,shiftSessionId:'old',shiftGeneration:1}};
res=await endpoint();
ok(res.data.agents[0].coverage.status==='no-evidence','Shift identity mismatch protected');
ok(res.data.agents[0].coverage.confirmed===0,'Old-shift count not copied');
// Unavailable source must be explicit, not a healthy/zero report.
failedRead.add(`cov/daily/${fakeDate}`);res=await endpoint();
ok(res.data.agents[0].coverage.status==='unavailable','Firebase read failures remain visible');
ok(res.data.sourceStatus.coverage==='unavailable','Source health surfaced');failedRead.clear();
// Active overnight from previous PHT date uses correct daily root.
records.__shifts.agenta={...shift,reportDate:'2026-10-30'};
records['cov/daily/2026-10-30']={agenta:{submitted:11,shiftSessionId:'sh1',shiftGeneration:2,serverUpdatedAtMs:now-1000}};
res=await endpoint();
ok(res.data.agents[0].reportDate==='2026-10-30','Authorized active overnight shift date');
ok(res.data.agents[0].coverage.confirmed===11,'Overnight data not silently lost');
// Three-day-old active shift outside permitted window cannot initiate arbitrary historic reads.
records.__shifts.agenta={...shift,reportDate:'2026-10-20'};
res=await endpoint();
ok(res.data.agents[0].reportDate===fakeDate,'Old dates stay out of monitor');
ok(context.syncGuardianDateWithinWindowServer('2026-10-28','2026-10-31')===false,'Date window bounded');
// Server requires real active Admin, cannot accept a role hint.
allowAdmin=false;await assert.rejects(endpoint(),{status:403});checks++;
allowAdmin=true;await assert.rejects(context.handleWorkforceSyncGuardianApi(request('POST'),{}, {pathname:'/api/workforce/sync-guardian/summary'}),{status:405});checks++;
await assert.rejects(context.handleWorkforceSyncGuardianApi(request(),{}, {pathname:'/api/workforce/sync-guardian/other'}),{status:404});checks++;
ok(writes===0,'No Firebase writes');
// UI only fetches using fresh Admin Firebase credentials and GET; never mutates.
ok(client.includes("data-tool=\"syncguardian\""),'Admin Tools entry');
ok(client.includes("case'syncguardian':openSyncGuardian()"),'User action wiring');
ok(client.includes("window.firebase?.auth?.().currentUser"),'Admin Firebase credential context');
ok(client.includes("method:'GET',cache:'no-store'"),'No caching or write requests');
ok(client.includes('Server-accepted data only'),'UI labels provenance');
ok(client.includes('Browser-local pending queues'),'UI states observability gap');
ok(css.includes('UX18P46 Sync Guardian'),'UX18P46 styles bundled');
ok(html.includes('sync-guardian-ux18p46'),'New Admin script cache key');
ok(source.includes("if (url.pathname.startsWith('/api/workforce/sync-guardian/'))"),'Worker route exists');
ok(!source.slice(begin,end).includes('firebaseAdminSet(')&&!source.slice(begin,end).includes('firebaseAdminPatch('),'Server has no mutator calls');
ok(!source.slice(begin,end).includes('requireActiveAdminUser('),'Read-only endpoint avoids Owner Recovery role-repair side effects');
console.log(`PASS UX18P46 Sync Guardian: ${checks} offline read-only, authorization, scoping, freshness, overnight, UI assertions; synthetic data only`);
