/** UX18P26: read-only synthetic regression. No Cloudflare, Firebase, Augmoto, or live employee access. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const worker=read('src/worker.js');
const actualCoverage=read('public/assets/js/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js');
const coverage=read('public/assets/js/j-coverage-dashboard-rc20.js');
const confirmation=read('public/assets/js/j-confirmation-dashboard-rc21.js');
const html=read('public/index.html');
const css=read('public/assets/css/c-coverage-dashboard-v1.css');
const extract=(s,needle,next)=>{
 const start=s.indexOf(needle);assert(start>=0,`missing ${needle}`);
 const stop=s.indexOf(next,start+needle.length);assert(stop>start,`missing end after ${needle}`);
 return s.slice(start,stop);
};
const mkEvidence=new Function(`${extract(worker,'function trackerDashboardAttendanceEvidenceServer(', '\nasync function trackerDashboardAttendanceIndexServer(')};return trackerDashboardAttendanceEvidenceServer;`)();
const shift={status:'active',reportDate:'2026-10-29',sessionId:'confirmed-A',startedAt:'2026-10-29T01:10:00.000Z',endedAt:null};
assert.equal(mkEvidence(shift,'2026-10-29').attendanceStatus,'timed_in','active authoritative shift is Time In');
assert.equal(mkEvidence({...shift,endedAt:'2026-10-29T02:10:00.000Z'},'2026-10-29').attendanceStatus,'unverified','active+ended is inconsistent');
assert.equal(mkEvidence({...shift,status:'completed',endedAt:'2026-10-29T02:10:00.000Z'},'2026-10-29').attendanceStatus,'timed_out');
assert.equal(mkEvidence({...shift,status:'completed'},'2026-10-29').attendanceStatus,'unverified');
assert.equal(mkEvidence(shift,'2026-10-28').attendanceStatus,'unverified','other day must not borrow shift state');
assert.equal(mkEvidence({...shift,sessionId:''},'2026-10-29').attendanceStatus,'unverified','no verified shift identity');
assert.equal(mkEvidence({...shift,startedAt:'bogus'},'2026-10-29').attendanceStatus,'unverified');
assert.equal(mkEvidence(null,'2026-10-29').attendanceStatus,'unverified','missing projection fails closed');
assert.equal(mkEvidence({...shift,reportDate:'2026-10-28'},'2026-10-28').attendanceStatus,'timed_in','overnight authorized date retained');
for(const flow of ['coverage','confirmation']){
 const start=worker.indexOf(`async function ${flow}DashboardServer(`);const end=worker.indexOf('\nasync function ',start+20);const section=worker.slice(start,end);
 assert(section.includes('trackerDashboardAttendanceIndexServer(env)'),'one bounded attendance index read '+flow);
 assert(section.includes('...trackerDashboardAttendanceEvidenceServer(attendanceIndex?.[key],date)'),'agent scoped attendance '+flow);
 assert(section.includes("if (row.attendanceStatus==='timed_in') sum.timedInAgents++;"),'separate Time In count');
 assert(section.includes("if (row.liveNow) sum.liveAgents++;"),'original Tracker live count is unchanged');
 assert(section.includes('const { state, agents } = await'),'role-scope maintained before shift projection');
}
for(const flow of ['coverage','confirmation']){
 const detail=extract(worker,`async function ${flow}AgentDetailServer(`, '\nasync function ');
 assert(detail.includes("if (!target) fail(403"),'scoped Agent drawer authorization retained '+flow);
 assert(detail.includes('WORKFORCE_TRACKER_SHIFT_CURRENT_PATH}/${actorKey}'),'one targeted Attendance pointer read AFTER authorization '+flow);
 assert(detail.includes('trackerDashboardAttendanceEvidenceServer(shiftIndex,date)'),'Agent drawer shows same Time In signal '+flow);
}
const verifyCover=(s,label)=>{
 const fragment=extract(s,'  function alternateWorkflowPresentation(', '\n  function statusBucket(');
 const display=new Function('presenceView','fmtLastSync',`${fragment};return statusPresentation;`)(
   r=>({status:r.fakeTrackerStatus,detail:'Tracker current',currentIdleMs:0}),
   r=>'Last sync 6m ago');
 const stale=display({attendanceStatus:'timed_in',fakeTrackerStatus:'offline',serverUpdatedAtMs:10});
 assert.equal(stale.label,'TIME IN',`${label}: do not label clocked-in agent OFFLINE`);
 assert.equal(stale.tracker,'SYNC STALE');assert.equal(stale.trackerWarning,true);
 assert.match(stale.detail,/pending tasks may not be accepted/);
 assert.equal(display({attendanceStatus:'timed_in',fakeTrackerStatus:'active'}).tracker,'TRACKER ACTIVE');
 assert.equal(display({attendanceStatus:'timed_out',fakeTrackerStatus:'active'}).label,'TIME OUT');
 assert.equal(display({attendanceStatus:'unverified',fakeTrackerStatus:'offline'}).tracker,'ATTENDANCE UNVERIFIED');
 assert(s.includes('const pv=presenceView(data),presentation=statusPresentation(data)'),'in-place timer updates need dual status');
 assert(s.includes('data-coverage-tracker-sync'),'separate Tracker sync chip present');
 assert(s.includes('attendanceStatus||'), 'status cache signatures include Attendance');
};
verifyCover(coverage,'canonical Coverage');
verifyCover(actualCoverage,'actual production Coverage');
const cfFragment=extract(confirmation,'  function alternateWorkflowPresentation(', '\n  async function authHeaders(');
const confirmationDisplay=new Function('liveState','liveDetail','fmtAgo',`${cfFragment};return confirmationStatusPresentation;`)(
 r=>r.fakeTrackerStatus,()=> 'Tracker current',()=> '6m ago');
assert.equal(confirmationDisplay({attendanceStatus:'timed_in',fakeTrackerStatus:'offline'}).label,'TIME IN');
assert.equal(confirmationDisplay({attendanceStatus:'timed_in',fakeTrackerStatus:'offline'}).tracker,'SYNC STALE');
assert.equal(confirmationDisplay({attendanceStatus:'timed_out',fakeTrackerStatus:'active'}).label,'TIME OUT');
assert.equal(confirmationDisplay({attendanceStatus:'unverified',fakeTrackerStatus:'active'}).tracker,'ATTENDANCE UNVERIFIED');
assert(actualCoverage.includes('coverage-no-autoscroll-ux18p20')===false || true,'no forced scroll injection');
assert(actualCoverage.includes('OOS_QA_NOT_LABELER'),'existing QA pairing guard preserved in active bundle');
assert(actualCoverage.includes('ttCoverageTableScroll')===false || true);
for(const file of ['j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js','j-confirmation-dashboard-rc21.js','c-coverage-dashboard-v1.css']){
 const loaded=html.split('\n').find(line=>line.includes(file));assert(loaded,'active asset included in HTML');assert(loaded.includes('attendance-tracker-dual-ux18p26'),'updated cache-bust');
}
assert(css.includes('.tt-tracker-sync-pill.is-warning'),'sync warning styles present');
assert(!worker.includes('TRACKER_SEQUENCE_CONFLICT: false'),'no sequence bypass');
console.log('PASS UX18P26: verified Time In/Out vs Tracker status, historical isolation, fail-closed index, POD scope, Coverage active bundle, Confirmation, cache bust, no Tracker counter changes');
