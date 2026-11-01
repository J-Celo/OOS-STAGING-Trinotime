import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const load = n => fs.readFileSync(new URL('../'+n, import.meta.url), 'utf8');
const client = load('public/assets/js/j-5a9b0d9aeabc.js');
const view = load('public/assets/js/j-1e287a103932.js');
const html = load('public/index.html');
const css = load('public/assets/css/c-attendance-reconciliation-ux15.css');
const from = client.indexOf('        function getTodaySummaryForDashboard() {');
const until = client.indexOf('\n        function getAgentQuickStatusForDashboard(', from);
assert(from > 0 && until > from);
const fn = client.slice(from, until);
const day = '10/24/2026';
const at = (name,pod) => ({name,pod});
const records = {
 [`${day}|Working`]:{pod:'POD 0',timeIn:'2026-10-23T22:00:00Z'},
 [`${day}|On break`]:{pod:'POD 0',timeIn:'2026-10-23T22:00:00Z',startBreak:'2026-10-24T01:00:00Z'},
 [`${day}|Unlisted agent`]:{pod:'POD 0',timeIn:'2026-10-23T22:00:00Z'},
 [`${day}|Foreign agent`]:{pod:'ALBERTSONS POD 1',timeIn:'2026-10-23T22:00:00Z'},
 [`${day}|Voided`]:{pod:'POD 0',timeIn:'2026-10-23T22:00:00Z',voided:true},
 [`${day}|Unlisted voided`]:{pod:'POD 0',timeIn:'2026-10-23T22:00:00Z',voided:true},
};
const roster=[at('Working','POD 0'),at('On break','POD 0'),at('No punch','POD 0'),at('Day off','POD 0'),at('Voided','POD 0')];
function run({admin=true,tl=false,ready=true,verified=true,pending=false,pod='All Pods',sourceRecords=records,sourceRoster=roster}={}){
 const now=Date.UTC(2026,9,24,2,0);
 const ctx={
  isAdmin:admin,isTeamLeader:tl,lockedPod:tl?'POD 0':'',activePod:pod,activeTeam:'CWH',ALL_PODS_LABEL:'All Pods',
  teamGroupById:()=>({fullName:'Chemist Warehouse'}),podDisplayName:x=>x,
  todayKeyPart:()=>day,attendanceViewerEmployees:()=>sourceRoster.filter(e=>pod==='All Pods'||e.pod===pod),
  agentSessionAuthenticated:!admin&&!tl,agentSessionPod:'POD 0',
  attendanceHydratedContext:ready?'ready':'old',attendanceReadContext:()=> 'ready',
  attendanceSecureSnapshotCache:{agent:verified?{}:null,loadedAt:verified?now-40000:0},fbConnected:verified,
  labelerRosterEmployees:()=>sourceRoster,isKnownTeamLeader:name=>name.startsWith('TL '),getTrueNowMs:()=>now,
  resolveEffectiveAvailability:name=>({available:name!=='Day off'}),
  isVoidedAttendanceRecord:rec=>rec.voided===true,
  analyzeAttendanceRecordForDashboard:()=>({hasIssue:false}),
  attendanceRecordDate:(rec,fallback)=>rec.date||fallback,
  addDaysToDateStr:()=> '10/23/2026',allRecords:sourceRecords,teamIdForPod:pod=>pod.startsWith('ALBERTSONS')?'ALBERTSONS':'CWH',
  hasPendingExportDataSync:()=>pending,
  getTodayRecord:name=>sourceRecords[`${day}|${name}`]||{}
 };
 vm.runInNewContext(fn+'\nthis.report=getTodaySummaryForDashboard()',ctx);
 return ctx.report;
}
let report=run();
assert.equal(report.working,2,'working roster + unlisted punch');
assert.equal(report.onBreak,1);assert.equal(report.notIn,2,'scheduled without punch + voided');
assert.equal(report.reconciliation.missingTotal,2);
assert.deepEqual(Array.from(report.reconciliation.missingTimeIn,r=>r.name),['No punch','Voided']);
assert.equal(report.reconciliation.unrosteredTotal,1);
assert.equal(report.reconciliation.unrosteredPunches[0].name,'Unlisted agent');
assert.equal(report.serverVerified,true);
assert.equal(run({pod:'POD 1'}).reconciliation.unrosteredTotal,0,'selected POD restricts candidate reconciliation');
assert.equal(run({admin:false,tl:true,pod:'POD 0'}).reconciliation,undefined,'TL receives no private admin list');
assert.equal(run({admin:false,tl:false,pod:'POD 0'}).reconciliation,undefined,'Agent receives no private admin list');
assert.equal(run({pending:true}).serverVerified,false,'unsent changes are not verified');
assert.equal(run({ready:false}).ready,false);
assert.equal(run({verified:false}).serverVerified,false);
const huge={}; for(let i=0;i<130;i++)huge[`${day}|Missing roster ${i}`]={pod:'POD 0',timeIn:'2026-10-23T22:00:00Z'};
report=run({sourceRecords:huge,sourceRoster:[]});
assert.equal(report.working,130);assert.equal(report.reconciliation.unrosteredTotal,130);
assert.equal(report.reconciliation.unrosteredPunches.length,80);assert.equal(report.reconciliation.limited,true);
assert(html.includes('id="attendanceReconciliation" hidden') && html.includes('id="attendanceReconciliationToggle"'));
assert(html.includes('c-attendance-reconciliation-ux15.css'));
assert(css.includes('attendanceReconciliationDetails[hidden]') && css.includes('max-width:720px'));
const start=view.indexOf('        // UX15: summary-detail reconciliation');
const stop=view.indexOf('\n        function renderTodaySummary()',start);
assert(start>0&&stop>start);
const renderer=view.slice(start,stop);
assert(renderer.includes("summary.viewerRole==='admin'"));
assert(renderer.includes("dataset?.trinoRole||''"));
assert(renderer.includes('content.replaceChildren(state)'),'Switching role clears detail rows');
assert(!renderer.includes('innerHTML'),'Render user-visible names using text nodes only');
assert(renderer.includes('const state=document.getElementById'), 'Persistent status node is recovered on every render');
assert(view.includes('renderAttendanceReconciliation(summary);'));
console.log('PASS UX15: real roster/punch mismatch, POD/team boundaries, voided records, pending/failed server states, TL/Agent privacy, bounded UI and safe rendering');
