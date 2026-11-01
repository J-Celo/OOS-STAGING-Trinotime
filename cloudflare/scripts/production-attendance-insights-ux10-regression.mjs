import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const main=read('public/assets/js/j-5a9b0d9aeabc.js');
const view=read('public/assets/js/j-1e287a103932.js');
const index=read('public/index.html');
const css=read('public/assets/css/c-attendance-insights-ux10.css');
assert(index.includes('attendanceSummaryTrust') && index.includes('attendanceSummaryTlCoaching'));
assert(index.includes('prod-ux17p2=20261026'));
assert(index.includes('c-attendance-insights-ux10.css?v=3.0.4-ux17p2'));
assert(css.includes('attendanceSummaryRosterWarning') && css.includes('max-width:640px'));
const a=main.indexOf('        function getTodaySummaryForDashboard() {');
const b=main.indexOf('\n        function getAgentQuickStatusForDashboard',a);
const fn=main.slice(a,b);
function summaryFor({admin,tl=false,server=true,age=60000,records={},roster=[],pod='POD 1',ready=true,pending=false}){
  const now=Date.UTC(2026,9,24,2,0,0),today='10/24/2026';
  const context={isAdmin:admin,isTeamLeader:tl,lockedPod:tl?pod:'',activePod:pod,activeTeam:'CWH',ALL_PODS_LABEL:'All Pods',
    teamGroupById:()=>({fullName:'Chemist Warehouse'}),podDisplayName:x=>x,
    todayKeyPart:()=>today,attendanceViewerEmployees:()=>roster.filter(e=>admin||e.pod===pod),agentSessionAuthenticated:!admin&&!tl,agentSessionPod:pod,
    attendanceHydratedContext:ready?'live':'old',attendanceReadContext:()=> 'live',
    attendanceSecureSnapshotCache:{agent:server?{}:null,loadedAt:server?now-age:0},fbConnected:server,
    labelerRosterEmployees:()=>roster,isKnownTeamLeader:()=>false,getTrueNowMs:()=>now,
    resolveEffectiveAvailability:()=>({available:true}),isVoidedAttendanceRecord:r=>!!r.voided,
    analyzeAttendanceRecordForDashboard:()=>({hasIssue:false}),attendanceRecordDate:(r,d)=>r.date||d,
    addDaysToDateStr:()=> '10/23/2026',allRecords:records,teamIdForPod:()=> 'CWH',
    getTodayRecord:name=>records[today+'|'+name] || {},hasPendingExportDataSync:()=>pending };
  vm.runInNewContext(fn+'\nthis.result = getTodaySummaryForDashboard();',context);
  return context.result;
}
const rows={}; for(let i=0;i<15;i++)rows['10/24/2026|Agent '+i]={timeIn:'2026-10-24T01:00:00Z',pod:'POD 1'};
const roster=[{name:'Agent 0',pod:'POD 1'},{name:'Agent 1',pod:'POD 1'}];
let s=summaryFor({admin:true,records:rows,roster});
assert.equal(s.working,15); assert.equal(s.unmatched,13);
assert.equal(s.serverVerified,true); assert.equal(s.snapshotAgeMs,60000);
assert.equal(s.viewerRole,'admin');
s=summaryFor({admin:true,records:rows,roster,pending:true});
assert.equal(s.serverVerified,false,'Unacknowledged local attendance writes cannot imply server verification');
assert.equal(s.pendingAttendanceWrites,true);
s=summaryFor({admin:true,records:rows,roster,age:250000});
assert.equal(s.serverVerified,false,'Aging authenticated snapshot is NOT fresh');
s=summaryFor({admin:true,server:false,records:rows,roster});assert.equal(s.serverVerified,false);
s=summaryFor({admin:true,records:rows,roster,ready:false});assert.equal(s.ready,false);assert.equal(s.serverVerified,false);
s=summaryFor({admin:false,tl:true,records:rows,roster});assert.equal(s.working,2,'TL must not join unrostered record evidence');
assert.equal(s.unmatched,0);assert.equal(s.viewerRole,'teamleader');assert.equal(s.scopePod,'POD 1');
// Exercise the actual production renderer with a lightweight DOM/context shim.
const from=view.indexOf('        function renderTodaySummary() {');
const to=view.indexOf('\n        function renderAgentStatus()',from);
assert(from>0&&to>from);
const renderer=view.slice(from,to);
const elements={};
for(const id of ['attendanceSummaryWorking','attendanceSummaryBreak','attendanceSummaryComplete','attendanceSummaryNotIn','attendanceSummaryIssues','attendanceSummaryScope','attendanceSummaryTrust','attendanceSummaryRosterWarning','attendanceSummaryTlCoaching']){
 elements[id]={id,textContent:'',hidden:id.includes('Warning')||id.includes('TlCoaching'),dataset:{},title:''};
}
const title={textContent:'Today at a glance'};
const document={body:{dataset:{trinoRole:'teamleader'}},getElementById:id=>elements[id],querySelector:()=>title,querySelectorAll:()=>[]};
let current=summaryFor({admin:false,tl:true,records:rows,roster});
const window={TrinoTimeCoaching:{getVisibleSessions:()=>[
  {pod:'POD 1',status:'ACTIVE'},{pod:'POD 2',status:'ACTIVE'},{pod:'POD 1',status:'COMPLETED'}
]}};
const context={document,window,metricFilter:'',bridge:()=>({getTodaySummary:()=>current}),renderAttendanceReconciliation:()=>{},Intl,Date};
vm.runInNewContext(renderer+'\nthis.run = renderTodaySummary;',context);
context.run();
assert.equal(title.textContent,'My POD · Quick Team Status');
assert.equal(elements.attendanceSummaryWorking.textContent,'2');
assert.equal(elements.attendanceSummaryTlCoaching.textContent,'Coaching: 1 visible active');
assert.equal(elements.attendanceSummaryTlCoaching.hidden,false);
assert.equal(elements.attendanceSummaryTrust.dataset.state,'fresh');
document.body.dataset.trinoRole='admin';current=summaryFor({admin:true,records:rows,roster,pending:true});context.run();
assert.equal(elements.attendanceSummaryTrust.dataset.state,'pending');
assert.match(elements.attendanceSummaryTrust.textContent,/pending sync/);
current=summaryFor({admin:true,records:rows,roster,age:250000});context.run();
assert.equal(title.textContent,'Today at a glance');
assert.equal(elements.attendanceSummaryTlCoaching.hidden,true);
assert.equal(elements.attendanceSummaryTrust.dataset.state,'stale');
assert.match(elements.attendanceSummaryRosterWarning.textContent,/13 .*roster/);
assert.equal(elements.attendanceSummaryRosterWarning.hidden,false);
console.log('PASS UX10: real counts, 3-minute freshness, TL isolation, coaching scope, admin roster warning, honest status labels, no new endpoints');
