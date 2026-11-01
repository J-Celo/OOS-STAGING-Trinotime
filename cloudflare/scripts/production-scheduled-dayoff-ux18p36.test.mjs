/** UX18P36 offline, synthetic read-only day-off classification regression. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const home=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>readFileSync(resolve(home,f),'utf8');
const worker=read('src/worker.js');
const sourceStart=worker.indexOf('function trackerDashboardDayOffEvidenceServer(');
const sourceEnd=worker.indexOf('\nasync function trackerDashboardAttendanceIndexServer(',sourceStart);
assert(sourceStart>=0&&sourceEnd>sourceStart);
const normalize=name=>String(name||'').trim().replace(/\s+/g,' ');
const ctx=new Function('cleanText','normalizePersonName','OOS_QA_INDEPENDENT_POD','qaDayOffEffectiveDaysServer',`return (${worker.slice(sourceStart,sourceEnd).split('\n//')[0].replace(/^function trackerDashboardDayOffEvidenceServer/,'function trackerDashboardDayOffEvidenceServer')});`);
const evidence=ctx((value)=>String(value||'').trim(),normalize,'OOS Coverage Beta QAs',(history,date)=>{for(let i=(history||[]).length-1;i>=0;i--)if(history[i].effectiveFrom<=date)return history[i].days;return null;});
const monday='2026-10-26',sunday='2026-11-01';
const agent={name:'Anna Sample',pod:'POD 2',employeeId:'id-anna'};
const other={name:'Bill Sample',pod:'POD 2',employeeId:'id-bill'};
const snapshot={schedule:{'POD 2':{rows:[['Sample','', '', '', '', '', '']]}},swaps:[]};
assert.equal(evidence(agent,sunday,snapshot,[agent]).dayOffStatus,'day_off');
assert.equal(evidence(agent,monday,snapshot,[agent]).dayOffStatus,'not_scheduled');
assert.equal(evidence(agent,sunday,snapshot,[agent,other]).dayOffStatus,'not_scheduled','ambiguous surname must not grant day off');
assert.equal(evidence(agent,sunday,{schedule:{},swaps:[]},[agent]).dayOffStatus,'not_scheduled');
assert.equal(evidence(agent,sunday,null,[agent]).dayOffStatus,'unverified');
assert.equal(evidence(agent,sunday,{...snapshot,swaps:[{date:'11/1/2026',pod:'POD 2',offAgent:'Anna Sample',workAgent:'Bill Sample',createdAt:'2026-10-25T00:00:00Z'}]},[agent]).dayOffStatus,'not_scheduled','swapped-off agent is working');
assert.equal(evidence(other,sunday,{schedule:{'POD 2':{rows:[]}},swaps:[{date:'11/1/2026',pod:'POD 2',offAgent:'Anna Sample',workAgent:'Bill Sample'}]},[agent,other]).dayOffStatus,'day_off','swapped-work agent receives day off');
const qa={name:'QA Sample',pod:'OOS Coverage Beta QAs',employeeId:'qa-123456'};
assert.equal(evidence(qa,sunday,{schedule:{[qa.pod]:{qaSelfDayOffHistoryByEmployeeId:{'qa-123456':[{effectiveFrom:'2026-10-01',days:[0]}]}}},swaps:[]},[qa]).dayOffStatus,'day_off','QA independent schedule respected');
for(const file of ['public/assets/js/j-coverage-dashboard-rc20.js','public/assets/js/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js','public/assets/js/j-confirmation-dashboard-rc21.js']){
  const code=read(file),coverage=file.includes('coverage');
  const start=code.indexOf('  function alternateWorkflowPresentation(');
  const end=code.indexOf(coverage?'\n  function statusBucket(':'\n  async function authHeaders(',start);
  assert(start>0&&end>start);
  const presenter=new Function('presenceView','liveState','liveDetail','fmtLastSync','fmtAgo',`${code.slice(start,end)};return ${coverage?'statusPresentation':'confirmationStatusPresentation'};`)(
    ()=>({status:'offline',detail:'other'}),()=> 'offline',()=> 'other',()=> 'Never synced',()=> 'Never synced');
  const base={dayOffStatus:'day_off',attendanceStatus:'unverified',serverUpdatedAtMs:0};
  assert.equal(presenter(base).label,'DAY OFF',file);
  assert.equal(presenter({...base,dayOffStatus:'not_scheduled'}).label,'OFFLINE',file);
  assert.equal(presenter({...base,dayOffStatus:'unverified'}).tracker,'ATTENDANCE UNVERIFIED',file);
  assert.equal(presenter({...base,attendanceStatus:'timed_out'}).label,'TIME OUT',file);
  assert.equal(presenter({...base,attendanceStatus:'timed_in'}).label,'TIME IN',file);
}
for(const fn of ['coverageDashboardServer','confirmationDashboardServer','coverageAgentDetailServer','confirmationAgentDetailServer']){
  const block=worker.slice(worker.indexOf('async function '+fn+'('),worker.indexOf('\nasync function ',worker.indexOf('async function '+fn+'(')+20));
  assert(block.includes('trackerDashboardDayOffSnapshotServer(env)'),fn+' schedule retrieval');
  assert(block.includes('trackerDashboardDayOffEvidenceServer('),fn+' per-agent evidence');
}
assert(worker.includes('TRACKER_DAYOFF_SNAPSHOT_TTL_MS=45000'),'bounded schedule snapshot cache');
assert(!worker.slice(sourceStart,sourceEnd).includes('firebaseAdminSet('),'day-off label is read only');
console.log('PASS UX18P36 day-off status: exact/ambiguous name, recurring/swap/QA, missing schedule, Time In/Time Out priority, both dashboards and details, bounded read-only schedule authority');
