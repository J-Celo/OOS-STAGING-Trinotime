/** UX18P42: Offline UI/rendering checks. No live accounts, network or Firebase access. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const metrics=read('../public/assets/js/j-agent-metrics-rc22.js');
const confirmation=read('../public/assets/js/j-confirmation-dashboard-rc21.js');
const coverage=read('../public/assets/js/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js');
const html=read('../public/index.html');
const css=read('../public/assets/css/c-coverage-dashboard-v1.css');
const duration=metrics.match(/function duration\(ms\)\{[^\n]+\}/)?.[0];
assert.ok(duration,'real existing h/m formatter must remain');
const mctx={};vm.runInNewContext(`${duration};globalThis.f=duration`,mctx);
assert.equal(mctx.f(4989.87*60000),'83h 9m');
assert.equal(mctx.f(65*60000),'1h 5m');
assert.equal(mctx.f(35*60000),'35m');
assert.match(metrics,/statCard\('clock','Active time',summary\.totalActiveMs\?duration\(summary\.totalActiveMs\)/,'overview uses h/m without changing stored timing');
assert.match(metrics,/Active time \(h\/m\)/,'detailed time column has matching units');
assert.match(metrics,/duration\(r\.measuredActiveMs\)/,'roster times use same safe formatter');
assert.match(metrics,/clearTimeout\(metricsSearchTimer\).*setTimeout\(\(\)=>\{metricsSearchTimer=null;lastRenderSignature='';if\(active\)renderRows\(true\);\},140\)/,'agent search coalesces typing');
assert.match(metrics,/function close\(\)\{clearTimeout\(metricsSearchTimer\)/,'closed workspace cancels pending search');
for(const [source,kind] of [[metrics,'metrics'],[confirmation,'confirmation']]){
 assert.match(source,/btn\.dataset\.ttNavMode!=='premium'/,'avoid rebuilding '+kind+' navigation each poll');
 assert.match(source,/btn\.dataset\.ttNavMode!=='fallback'/,'preserve fallback navigation');
}
assert.match(coverage,/if\(state\.busy\)\{if\(force\)state\.refreshQueued=true;return;\}/,'routine Coverage polls do not create fetch backlogs');
assert.match(coverage,/ttReconcileCoverageNode\(ttOldShell, ttNextShell\)/,'retain working Coverage keyed reconciliation');
assert.match(confirmation,/const confirmationBoundAgentButtons=new WeakSet\(\)/,'bind row actions only once per button');
assert.match(confirmation,/if\(previous\[i\]\.outerHTML!==incoming\[i\]\.outerHTML\)previous\[i\]\.replaceWith\(incoming\[i\]\)/,'update only changed Confirmation rows');
assert.match(confirmation,/paintConfirmationSnapshot\(confirmationMarkup\)/,'use stable Confirmation scroller');
for(const token of ['UX18P42','tt-mx-team-card'])assert.ok(css.includes(token));
for(const token of ['metrics-render-ux18p42','confirmation-render-ux18p42','coverage-poll-ux18p42'])assert.ok(html.includes(token));

// Exercise the actual new presenter with a deliberately small mock DOM. It must
// preserve scroller identity, unchanged rows and row event wiring.
const start=confirmation.indexOf('const confirmationBoundAgentButtons=new WeakSet()');
const end=confirmation.indexOf('function renderDashboard(d,{force=false}={})',start);
assert(start>0&&end>start);
const rows=[{outerHTML:'<tr>A</tr>'},{outerHTML:'<tr>B old</tr>'}];
let edits=0,statEdits=0,scrollReplacements=0,handlers=0;
const incoming=[{outerHTML:'<tr>A</tr>'},{outerHTML:'<tr>B new</tr>'}];
rows[0].replaceWith=()=>{throw Error('unchanged row must be preserved')};
rows[1].replaceWith=fresh=>{rows[1]=fresh;edits++};
const oldTbody={get children(){return rows},replaceChildren(...next){rows.splice(0,rows.length,...next);scrollReplacements++}};
const newTbody={get children(){return incoming}};
const stats={innerHTML:'old stats',replaceWith:()=>{statEdits++}};
const head={innerHTML:'old heading',replaceWith:()=>{statEdits++}};
const oldScroll={querySelector:s=>s==='tbody'?oldTbody:null,closest:()=>({append:()=>{}})};
const newScroll={querySelector:s=>s==='tbody'?newTbody:null};
const buttons=[{dataset:{confirmationAgent:'Agent A'},addEventListener(){handlers++}}];
const body={
 querySelector:s=>({'.tt-ops-stat-grid':stats,'.tt-ops-panel-head':head,'.tt-coverage-empty':null})[s]??null,
 querySelectorAll:s=>s==='[data-confirmation-agent]'?buttons:[],
};
const buffer={set innerHTML(v){this.value=v},querySelector:s=>({
 '#ttConfirmationTableScroll':newScroll,'.tt-ops-stat-grid':{innerHTML:'new stats'},
 '.tt-ops-panel-head':{innerHTML:'new heading'},'.tt-coverage-empty':null
 })[s]??null};
const scope={WeakSet,document:{createElement:()=>buffer},$:id=>({'ttConfirmationBody':body,'ttConfirmationTableScroll':oldScroll})[id],openAgentDrawer:()=>{}};
vm.runInNewContext(confirmation.slice(start,end)+';globalThis.paint=paintConfirmationSnapshot',scope);
scope.paint('fixture');
assert.equal(rows[0].outerHTML,'<tr>A</tr>');
assert.equal(rows[1].outerHTML,'<tr>B new</tr>');
assert.equal(edits,1);assert.equal(scrollReplacements,0);assert.equal(statEdits,2);assert.equal(handlers,1);
scope.paint('fixture');assert.equal(handlers,1,'preserved button must not receive duplicate event listener');
const oldTracker=readFileSync(new URL('../public/downloads/TrinoTime-QC-Tracker-v2.2.62.zip',import.meta.url));
assert.equal(createHash('sha256').update(oldTracker).digest('hex'),JSON.parse(read('../public/downloads/qc-tracker-current.json')).sha256,'staging Tracker SHA matches manifest');
console.log('PASS UX18P42: 83h 9m duration, coalesced search/nav/polls, incremental Confirmation render and stable scroller, tracker unchanged');
