import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

// Run the real dashboard summary implementation, not a reimplementation.
const main = fs.readFileSync(new URL('../public/assets/js/j-5a9b0d9aeabc.js', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../public/assets/js/j-1e287a103932.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const from = main.indexOf('        function getTodaySummaryForDashboard() {');
const end = main.indexOf('\n        function getAgentQuickStatusForDashboard', from);
assert.ok(from > 0 && end > from, 'Production summary function remains present');
const implementation = main.slice(from, end);
function count({admin=true, tl=false, team='CWH', pod='All Pods', employees=[], records={}, server=true, ready=true}) {
 const ctx={
   isAdmin:admin,isTeamLeader:tl,lockedPod:tl?pod:null,activePod:pod,activeTeam:team,
   ALL_PODS_LABEL:'All Pods',teamGroupById:()=>({fullName:'Chemist Warehouse'}),podDisplayName:x=>x,
   todayKeyPart:()=> '10/24/2026',attendanceViewerEmployees:()=>employees.filter(e=>admin?(pod==='All Pods'||e.pod===pod):tl?e.pod===pod:e.pod==='POD 0'),
   agentSessionAuthenticated:!admin&&!tl,agentSessionPod:'POD 0',
   attendanceHydratedContext:ready?'v1':'old',attendanceReadContext:()=> 'v1',
   attendanceSecureSnapshotCache:{agent:server?{}:null,loadedAt:server?Date.UTC(2026,9,23,21,2,0):0},fbConnected:server,
   labelerRosterEmployees:()=>employees,
   isKnownTeamLeader:name=>name.startsWith('TL '),
   getTrueNowMs:()=>Date.UTC(2026,9,23,21,3,0),
   resolveEffectiveAvailability:()=>({available:true}),
   isVoidedAttendanceRecord:rec=>rec.voided===true,
   analyzeAttendanceRecordForDashboard:()=>({hasIssue:false}),
   attendanceRecordDate:(rec,fallBack)=>rec.date||fallBack,
   addDaysToDateStr:()=> '10/23/2026',
   allRecords:records,
   teamIdForPod:p=>p.startsWith('Albertsons')?'ALBERTSONS':'CWH',
   getTodayRecord(name){const t=records['10/24/2026|'+name];if(t?.timeIn)return t;const old=records['10/23/2026|'+name];return old?.timeIn&&!old?.logOut?old:t||{};}
 };
 vm.runInNewContext(implementation+'\nthis.summary = getTodaySummaryForDashboard();',ctx);
 return ctx.summary;
}
const roster=[{name:'Roster 1',pod:'POD 0'},{name:'Roster 2',pod:'POD 0'}];
const records={};
for(let i=1;i<=15;i++)records[`10/24/2026|${i===1?'Roster 1':'Unlisted '+i}`]={timeIn:'2026-10-23T20:30:00Z',pod:'POD 0'};
let summary=count({employees:roster,records});
assert.equal(summary.working,15,'Admin counts authorized active punches even with partial local roster');
assert.equal(summary.unmatched,14,'Unmatched roster entries called out explicitly');
assert.equal(summary.scheduled,2,'Expected schedule does not cap live punch count');
assert.equal(summary.scope,'Chemist Warehouse · All Pods','Team-limited All Pods explicitly labelled');
summary=count({admin:false,tl:true,pod:'POD 0',employees:roster,records});
assert.equal(summary.working,1,'TL never incorporates unrostered snapshot rows');
assert.equal(summary.unmatched,0);
records['10/24/2026|External']={timeIn:'2026-10-23T20:30:00Z',pod:'Albertsons · POD 0'};
summary=count({employees:roster,records});
assert.equal(summary.working,15,'Do not count different team');
records['10/23/2026|Unlisted 2']=records['10/24/2026|Unlisted 2'];
summary=count({employees:roster,records});
assert.equal(summary.working,15,'Yesterday/today duplicate attendance keys count once');
records['10/24/2026|Unlisted 3'].logOut='2026-10-23T22:00:00Z';
summary=count({employees:roster,records});
assert.equal(summary.working,14); assert.equal(summary.complete,1);
records['10/24/2026|Unlisted 4'].voided=true;
summary=count({employees:roster,records});
assert.equal(summary.working,13);assert.equal(summary.unmatched,13,'Voided is excluded');
summary=count({employees:roster,records,server:false});
assert.equal(summary.serverVerified,false,'Offline/local cache is not advertised as server verified');
summary=count({employees:roster,records,ready:false});
assert.equal(summary.ready,false,'Pre-hydration status not claimed as final zero');
assert.match(view,/summary\.serverVerified === true/,'Client distinguishes verified snapshot status');
assert.match(view,/summary\.unmatched/,'Client exposes roster mismatch');
assert.match(view,/trinotime:attendance-projection-change/,'Realtime summary refresh preserves table repaint behavior');
assert.match(index,/attendanceSummaryScope/,'UI includes live summary source label');
console.log('PASS UX7 Admin active punch recovery, TL isolation, team boundary, duplicates, voided, server/readiness status');
