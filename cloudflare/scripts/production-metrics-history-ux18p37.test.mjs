/** UX18P37: isolated, offline client-only Agent Metrics history guard test.
 * No real credentials, users, APIs, Firebase or production mutation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const ui=read('../public/assets/js/j-agent-metrics-rc22.js');
const html=read('../public/index.html');
const css=read('../public/assets/css/c-coverage-dashboard-v1.css');
const helperStart=ui.indexOf('// UX18P37: The server\'s locked-shift endpoint');
const helperEnd=ui.indexOf('function targetJobLabel(job)',helperStart);
const refreshStart=ui.indexOf('async function refresh(force=false)');
const refreshEnd=ui.indexOf("document.addEventListener('trinotime:workspace-opening'",refreshStart);
assert(helperStart>0&&helperEnd>helperStart&&refreshStart>helperEnd&&refreshEnd>refreshStart);
assert(html.includes('history-selection-ux18p37=20261030'),'new metrics JS cache key required');
assert(html.includes('metrics-history-ui-ux18p37=20261030'),'new metrics CSS cache key required');
assert(css.includes('.tt-mx-history-selection')&&css.includes('.tt-mx-roster-pagination'));
assert(ui.includes('ttMetricsRosterPreviousPage')&&ui.includes('ttMetricsRosterNextPage'));
assert(ui.includes("for(const id of ['ttMetricsPreviousPage','ttMetricsRosterPreviousPage'])"),'visible and legacy pagination must share state');
assert(ui.includes("for(const id of ['ttMetricsNextPage','ttMetricsRosterNextPage'])"),'next page must remain server-paginated');
assert(ui.includes('10 agents per page'),'bounded roster pagination retained');
const btnHandlers={};
const elements={
 ttMetricsBody:{innerHTML:'',querySelectorAll:()=>[]},
 ttMetricsAgentField:{hidden:true,attrs:{},setAttribute(k,v){this.attrs[k]=v;}},
 ttMetricsAgent:{focused:false,focus(){this.focused=true;},value:''},
 ttMetricsCurrentAllAgents:{addEventListener(name,handler){btnHandlers.current=handler;}},
 ttMetricsChooseHistoryAgent:{addEventListener(name,handler){btnHandlers.choose=handler;}},
 ttMetricsRange:{value:'7',dispatchEvent(){this.changed=true;}},
 ttMetricsScope:{textContent:''},
 ttMetricsSettings:{hidden:true},
 ttMetricsRefresh:{textContent:'Refresh',disabled:false,setAttribute(){}}
};
let calls=[],role='admin',resetCount=0;
const c=createContext({
 $:id=>elements[id]||null,esc:value=>String(value),
 window:{TrinoTimeDashboardFreshness:{reset:()=>resetCount++,begin(){},fail(){},success(){}}},
 actor:()=>({role,name:'Admin',pod:''}),actorSig:()=>role+'|Admin|',normalizedRole:r=>r,
 active:true,busy:false,shiftRange:'7',requestedAgent:'',agentQuery:'',
 identity:'admin|Admin|',generation:0,metricsPod:'',metricsPodInitialized:true,shiftOffset:0,
 shiftScorecardsCollapsed:true, lastRefreshAt:0,lastData:{historical:'stale'},lastRenderSignature:'',date:'2026-10-30',pendingRefresh:false,
 phtDate:()=> '2026-10-30',api:async path=>{calls.push(path);throw new Error('synthetic return');},
 Event:class Event{constructor(name){this.type=name;}},
 setTimeout:()=>1, clearTimeout(){}, console
});
runInContext(ui.slice(helperStart,helperEnd)+'\n'+ui.slice(refreshStart,refreshEnd),c,{timeout:2000});
for(const range of ['7','30']){
 c.shiftRange=range;c.requestedAgent='';c.lastData={historical:'stale'};c.lastRefreshAt=0;
 for(let i=0;i<3;i++)await c.refresh(true);
 assert.equal(calls.length,0,`${range}-shift All agents must not issue HTTP 400-causing API calls`);
 assert.equal(c.lastData,null,`${range}-shift prompt must not display a stale snapshot`);
 assert(elements.ttMetricsBody.innerHTML.includes('Select one Agent'));
 assert(elements.ttMetricsAgentField.hidden===false,'Authorized agent selector remains usable');
}
btnHandlers.choose();assert.equal(elements.ttMetricsAgent.focused,true,'Select-agent action focuses search');
btnHandlers.current();assert.equal(elements.ttMetricsRange.changed,true,'All agents shortcut uses existing range-change handler');
for(const who of ['admin','team_leader']){
 role=who;c.identity=who+'|Admin|';c.shiftRange='7';c.requestedAgent='';calls=[];
 assert.equal(c.metricsHistoryNeedsAgent(who),true);
 await c.refresh(true);assert.equal(calls.length,0,`${who} history without selected Agent must be local-only`);
 c.requestedAgent='Agent One';await c.refresh(true);
 assert(calls.some(path=>path.startsWith('shifts?range=7&offset=0&agent=Agent%20One')),`${who} selected Agent history request restored`);
}
c.shiftRange='current';c.requestedAgent='';calls=[];await c.refresh(true);
assert(calls.includes('shifts?range=current&offset=0'),'Current Shift All agents remains available');
assert.equal(c.metricsHistoryNeedsAgent('agent'),false,'Self viewer must not be blocked by supervisor-only guard');
console.log('PASS UX18P37 Agent Metrics: no historical All-agents HTTP 400, selection/Current Shift actions, stale data cleared, Admin/TL scope, visible 10-agent roster pagination, unchanged backend route');
