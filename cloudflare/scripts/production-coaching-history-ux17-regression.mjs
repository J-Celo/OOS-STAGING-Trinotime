import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const base=path.resolve(import.meta.dirname,'..');
const html=fs.readFileSync(path.join(base,'public/index.html'),'utf8');
const src=fs.readFileSync(path.join(base,'public/assets/js/j-5a9b0d9aeabc.js'),'utf8');
const css=fs.readFileSync(path.join(base,'public/assets/css/c-coaching-insights-ux17.css'),'utf8');
const worker=fs.readFileSync(path.join(base,'src/worker.js'),'utf8');
const fn=(from,to)=>{const start=src.indexOf(from);const end=src.indexOf(to,start+from.length);assert(start>=0&&end>start,`missing ${from}`);return src.slice(start,end);};

for(const id of ['coachingReportStatus','coachingUx17Insights','coachingReportOverlay'])assert(html.includes(`id="${id}"`),`${id} missing`);
for(const option of ['completed','active','review'])assert(html.includes(`<option value="${option}">`));
assert(html.includes('c-coaching-insights-ux17.css'));
assert(src.includes('ttUx17CoachingHistory')&&src.includes('openCoachingReport();'),'Agent history shortcut absent');
assert(src.includes("coachingActor().role!=='agent'"),'Agent shortcut must check actor again on click');
assert(css.includes('focus-visible')&&css.includes('max-width:430px'));
assert(worker.includes('await personnelCanReadCoachingServer(env,actor,rec)'),'server coaching authorization removed');
assert(worker.includes("'/coaching/sessions'&&request.method==='GET'"),'secure coaching endpoint removed');

const inputs={coachingReportEmp:'',coachingReportType:'',coachingReportCoach:'',coachingReportStatus:'',coachingReportFrom:'',coachingReportTo:''};
const elements=Object.fromEntries(Object.entries(inputs).map(([id,value])=>[id,{value}]));
elements.coachingUx17Insights={innerHTML:''};
const now=Date.parse('2026-10-26T04:00:00Z');
const sessions={
 a:{id:'a',agentName:'Agent A',pod:'POD A',status:'COMPLETED',startTime:new Date(now-86400000).toISOString(),endTime:new Date(now-86400000+3600000).toISOString(),coachingType:'Quality',coachName:'TL A',coachRole:'teamleader',confirmationRequired:false,confirmationStatus:'confirmed',date:'10/25/2026'},
 b:{id:'b',agentName:'Agent B',pod:'POD B',status:'COMPLETED',startTime:new Date(now-86400000).toISOString(),endTime:new Date(now-86400000+1800000).toISOString(),coachingType:'Quality',coachName:'TL B',coachRole:'teamleader',confirmationRequired:true,confirmationStatus:'pending',date:'10/25/2026'},
 c:{id:'c',agentName:'Agent A',pod:'POD A',status:'ACTIVE',startTime:new Date(now-600000).toISOString(),coachingType:'Training',coachName:'TL A',coachRole:'teamleader',confirmationRequired:false,confirmationStatus:'confirmed',date:'10/26/2026'},
 d:{id:'d',agentName:'Agent A',pod:'POD A',status:'COMPLETED',startTime:new Date(now-40*86400000).toISOString(),endTime:new Date(now-40*86400000+1800000).toISOString(),coachingType:'Process',coachName:'TL A',coachRole:'teamleader',confirmationRequired:false,confirmationStatus:'confirmed',date:'09/16/2026'},
 e:{id:'e',agentName:'Agent A',pod:'POD A',status:'COMPLETED',startTime:new Date(now-2*86400000).toISOString(),endTime:new Date(now-2*86400000+900000).toISOString(),coachingType:'Training',coachName:'TL A',coachRole:'teamleader',confirmationRequired:false,confirmationStatus:'confirmed',date:'10/24/2026',reviewFlags:['UNVERIFIED_TIME']}
};
const ctx={
 allCoachingSessions:sessions,
 $(id){return elements[id]},
 visibleCoachingSession(s){return s.pod==='POD A'},
 normalizeCoachingStatus(s){return s},
 COACHING_COMPLETED:'COMPLETED',COACHING_ACTIVE:'ACTIVE',CONFIRM_PENDING:'pending',
 coachingReviewFlags(s){return s.reviewFlags||[]},
 coachingSessionStartMs(s){return Date.parse(s.startTime)},
 coachingElapsedMs(s){return s.endTime?Date.parse(s.endTime)-Date.parse(s.startTime):now-Date.parse(s.startTime)},
 reportDateComp(s){const [month,day,year]=s.date.split('/').map(Number);return year*10000+month*100+day},
 coachingDurationLabel(ms){return `${Math.round(ms/60000)}m`},
 formatManilaTime(s){return s.slice(0,10)},
 agentDisplayName(s){return s},
 escapeHtml(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')},
 coachingNowInfo(){return {ms:now}}
};
vm.createContext(ctx);
vm.runInContext(fn('function coachingReportScopeSessions(){','function populateCoachingReportFilters(){'),ctx);
vm.runInContext(fn('function coachingUx17ReportInsights(rows,now){','function renderCoachingReport(){'),ctx);
const choose=(status)=>{elements.coachingReportStatus.value=status;return Array.from(vm.runInContext('coachingReportScopeSessions()',ctx),s=>s.id)};
assert.deepEqual(choose(''),['c','a','e','d'].sort((x,y)=>Date.parse(sessions[y].startTime)-Date.parse(sessions[x].startTime)),'all authorized sessions only');
assert.deepEqual(choose('completed'),['a','e','d'],'completed filter');
assert.deepEqual(choose('active'),['c'],'active filter');
assert.deepEqual(choose('review'),['e'],'review filter');
elements.coachingReportStatus.value='';
vm.runInContext('coachingUx17ReportInsights(coachingReportScopeSessions(),coachingNowInfo().ms)',ctx);
const display=elements.coachingUx17Insights.innerHTML;
assert(display.includes('Last 30 days')&&display.includes('2 completed'),'30d report excludes older data');
assert(display.includes('30-day coaching time')&&display.includes('75m'),'recent duration');
assert(display.includes('Awaiting confirmation')&&display.includes('>0<'),'cross-POD pending must not leak');
assert(!display.includes('Agent B')&&!display.includes('TL B'),'cross-POD name leak');
// Filtered subset must control insights as well.
elements.coachingReportStatus.value='active';
vm.runInContext('coachingUx17ReportInsights(coachingReportScopeSessions(),coachingNowInfo().ms)',ctx);
assert(elements.coachingUx17Insights.innerHTML.includes('0 completed'));
console.log('UX17 Coaching history, scoped status filtering and insights: PASS');
