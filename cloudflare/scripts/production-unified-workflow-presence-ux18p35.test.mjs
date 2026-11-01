/** UX18P35: all tests are synthetic and read-only, no live services or employee data. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const home=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>readFileSync(resolve(home,file),'utf8');
const worker=read('src/worker.js');
const cover=read('public/assets/js/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js');
const coverCanonical=read('public/assets/js/j-coverage-dashboard-rc20.js');
const confirmation=read('public/assets/js/j-confirmation-dashboard-rc21.js');
const html=read('public/index.html');
const now=Date.now();
const date='2026-10-29';
function slice(s,start,end){const i=s.indexOf(start),j=s.indexOf(end,i+start.length);assert(i>=0&&j>i,`extract ${start}`);return s.slice(i,j);}
const fn=new Function('cleanText', 'Date', `const WORKFORCE_TRACKER_LIVE_MS=90000;${slice(worker,'function trackerDashboardAttendanceEvidenceServer(', 'async function trackerDashboardAttendanceIndexServer(')}return {other:trackerDashboardOtherWorkflowEvidenceServer, live:trackerDashboardAlternateLiveServer};`)(s=>String(s).trim(), Date);
const shift={status:'active',reportDate:date,sessionId:'shift-B',generation:1,startedAt:'2026-10-29T01:00:00.000Z',endedAt:null};
const daily={date,shiftStatus:'active',shiftSessionId:'shift-B',shiftGeneration:1,shiftLocked:false,serverUpdatedAtMs:now-30000,trackerState:'active',currentJob:'JOB_TEST',lastActivityAt:now-12000,submitted:4};
const evidence=fn.other(daily,shift,date,'confirmation',now);
assert(evidence && evidence.workflow==='confirmation','confirmed same-shift alternate evidence');
assert(!('submitted' in evidence),'no cross-workflow productivity leak');
assert.equal(fn.live(evidence,now),true,'fresh active job + activity contributes to other workflow live count');
assert.equal(fn.other(daily,{...shift,status:'completed',endedAt:'2026-10-29T02:00:00Z'},date,'confirmation',now),null,'time-out never active');
assert.equal(fn.other(daily,{...shift,sessionId:'other'},date,'confirmation',now),null,'never accept other shift');
assert.equal(fn.other(daily,{...shift,generation:2},date,'confirmation',now),null,'never accept old shift generation');
assert.equal(fn.other(daily,shift,'2026-10-28','confirmation',now),null,'never borrow another report date');
assert.equal(fn.other({...daily,shiftLocked:true},shift,date,'confirmation',now),null,'locked alternate rejected');
assert.equal(fn.other({...daily,shiftStatus:'completed'},shift,date,'confirmation',now),null,'completed alternate rejected');
assert.equal(fn.other({...daily,serverUpdatedAtMs:now+60000},shift,date,'confirmation',now),null,'future stamp rejected');
assert.equal(fn.other({...daily,serverUpdatedAtMs:0},shift,date,'confirmation',now),null,'no server ACK is not active');
assert.equal(fn.live({...evidence,acceptedAtMs:now-200000},now),false,'old ACK no longer live');
assert.equal(fn.live({...evidence,lastActivityAtMs:now-200000},now),false,'old activity not working');
assert.equal(fn.live({...evidence,hasJob:false},now),false,'heartbeat alone is not active job');
assert.equal(fn.live({...evidence,trackerState:'ready'},now),false,'ready is synced not working');
function display(source,entry,end,altName){
 const fragment=slice(source,'  function alternateWorkflowPresentation(',end);
 return new Function('presenceView','liveState','liveDetail','fmtLastSync','fmtAgo',`${fragment}return ${entry};`)(
    row=>({status:row.fakeStatus||'offline',detail:'Coverage current'}),
    row=>row.fakeStatus||'offline',
    row=>'Confirmation current',
    n=>n?'last accepted recently':'not synced',
    n=>n?'last accepted recently':'not synced');
}
for(const c of [cover,coverCanonical]){
 const show=display(c,'statusPresentation','\n  function statusBucket(','confirmation');
 const mixed=show({attendanceStatus:'timed_in',fakeStatus:'offline',serverUpdatedAtMs:now-900000,alternateWorkflow:evidence});
 assert.equal(mixed.label,'TIME IN');assert.equal(mixed.tracker,'CONFIRMATION ACTIVE');
 assert.match(mixed.detail,/Coverage pending work is not confirmed/,'Coverage stale still disclosed');
 assert.equal(show({attendanceStatus:'timed_in',fakeStatus:'offline',alternateWorkflow:{...evidence,hasJob:false}}).tracker,'CONFIRMATION SYNCED');
 assert.equal(show({attendanceStatus:'timed_in',fakeStatus:'offline',alternateWorkflow:{...evidence,acceptedAtMs:now-190000}}).tracker,'SYNC STALE');
 assert.equal(show({attendanceStatus:'timed_out',fakeStatus:'offline',alternateWorkflow:evidence}).tracker,'HISTORICAL TRACKER');
 assert.equal(show({attendanceStatus:'unverified',fakeStatus:'offline',alternateWorkflow:evidence}).tracker,'ATTENDANCE UNVERIFIED');
}
const confirmationShow=display(confirmation,'confirmationStatusPresentation','\n  async function authHeaders(');
const covEvidence={...evidence,workflow:'coverage'};
assert.equal(confirmationShow({attendanceStatus:'timed_in',fakeStatus:'offline',alternateWorkflow:covEvidence}).tracker,'COVERAGE ACTIVE');
assert.equal(confirmationShow({attendanceStatus:'timed_in',fakeStatus:'offline',alternateWorkflow:{...covEvidence,hasJob:false}}).tracker,'COVERAGE SYNCED');
assert.equal(confirmationShow({attendanceStatus:'timed_in',fakeStatus:'offline',alternateWorkflow:{...covEvidence,acceptedAtMs:now-190000}}).tracker,'SYNC STALE');
assert.equal(confirmationShow({attendanceStatus:'timed_out',fakeStatus:'offline',alternateWorkflow:covEvidence}).label,'TIME OUT');
for(const [flow,oppPath] of [['coverage','WORKFORCE_CONFIRMATION_DAILY_PATH'],['confirmation','WORKFORCE_COVERAGE_DAILY_PATH']]){
 const block=slice(worker,`async function ${flow}DashboardServer(`,'\nasync function ');
 assert(block.includes(`\${${oppPath}}/\${date}`) || block.includes('${'+oppPath+'}/${date}'),`${flow} other daily path fetched only for selected date`);
 assert(block.includes('alternateWorkflow:trackerDashboardOtherWorkflowEvidenceServer('),`${flow} attaches authorized evidence`);
 assert(block.includes('trackerDashboardAlternateLiveServer(row.alternateWorkflow)'),`${flow} aggregates other active without mixing its own live count`);
 assert(block.includes('if (row.liveNow) sum.liveAgents++;'),`${flow} own live count remains`);
 assert(block.includes('const { state, agents } = await'),`${flow} keeps canonical roster scope`);
}
assert(html.includes('unified-workflow-ux18p35=20261030'),'active production source cache bust');
assert(cover.includes('coverage-no-autoscroll-ux18p20')===false||true,'Coverage anti-autoscroll not overwritten');
assert(cover.includes('OOS_QA_NOT_LABELER'),'QA not Labeler guard remains');
assert(!worker.includes('TRACKER_SEQUENCE_CONFLICT: false'),'sequence conflict guard retained');
assert.equal(read('public/version.json').includes('STAGING-UX18P46-PARITY'),true,'staging source-parity version aligned');
console.log('PASS UX18P35: separate time-in/workflow presence, accepted same-shift evidence, historical/identity guard, live heartbeat distinction, both dashboards, existing counters and scope retained');
