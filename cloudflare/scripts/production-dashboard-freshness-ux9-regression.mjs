// Staging UX9: offline confirmation of honest dashboard-fetch status and isolation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=source('public/index.html');
const module=source('public/assets/js/j-dashboard-freshness-ux9.js');
const css=source('public/assets/css/c-dashboard-freshness-ux9.css');
const modules={
 coverage:source('public/assets/js/j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js'),
 confirmation:source('public/assets/js/j-confirmation-dashboard-rc21.js'),
 metrics:source('public/assets/js/j-agent-metrics-rc22.js'),
 store:source('public/assets/js/j-staging-store-operations-hub-v1.js')
};
for(const [name,src] of Object.entries(modules)){
 assert(src.includes(`TrinoTimeDashboardFreshness?.success('${name}'`));
 assert(src.includes(`TrinoTimeDashboardFreshness?.`));
 assert(html.includes('prod-ux17p2=20261026'),name+' script cache bust');
}
assert(html.indexOf('j-dashboard-freshness-ux9.js')<html.indexOf('j-coverage-dashboard-rc20-rc2-ui3-3e92d149a5b8.js'),'Module initialized before dashboards');
for(const s of ['Tracker','dashboard','delayed','failed','waiting'])assert(module.toLowerCase().includes(s.toLowerCase()));
assert(css.includes('max-width:640px'));
assert(!/\b(fetch|localStorage|sessionStorage)\s*\(/.test(module),'Dashboard UX may not fetch or store data');
assert(modules.coverage.indexOf("TrinoTimeDashboardFreshness?.success('coverage'")>modules.coverage.indexOf('assertDashboardViewerBinding(a,dashboard)'));
assert(modules.confirmation.indexOf("TrinoTimeDashboardFreshness?.success('confirmation'")>modules.confirmation.indexOf('assertDashboardViewerBinding(a,d)'));
assert(modules.metrics.indexOf("TrinoTimeDashboardFreshness?.success('metrics'")>modules.metrics.indexOf("d.authority!=='workforce-metrics-v1'"));
assert(modules.store.indexOf("TrinoTimeDashboardFreshness?.success('store'")>modules.store.indexOf('matchesVerifiedViewer(root,actor,r.viewer)'));
// VM with a tiny DOM ensures state display behavior stays honest without network or browser state.
const targets={};const roots={};
for(const name of Object.keys(modules)){
 const slot={children:[],querySelector(sel){return this.children.find(x=>x.dataset.ttFreshness===name)||null;},append(el){this.children.push(el);}};
 targets[name]=slot;
 roots[{coverage:'ttCoverageRoot',confirmation:'ttConfirmationRoot',metrics:'ttMetricsRoot',store:'ttPodDispatchRoot'}[name]]={hidden:false,querySelector(){return slot;}};
}
let clock=1000000;const callbacks=[];
class FakeDate extends Date{static now(){return clock;}}
const document={getElementById:id=>roots[id]||null,createElement:()=>({dataset:{},className:'',setAttribute(){}}),addEventListener(){},hidden:false};
const context={window:{},document,Date:FakeDate,setInterval:fn=>callbacks.push(fn)};
vm.runInNewContext(module,context);
const api=context.window.TrinoTimeDashboardFreshness;
function el(name){return targets[name].children[0];}
api.begin('coverage','AgentOne|day1');assert.match(el('coverage').textContent,/Refreshing/);
api.success('coverage','AgentOne|day1');assert.equal(el('coverage').dataset.state,'fresh');assert.match(el('coverage').textContent,/Dashboard fetched/);
clock+=120000;callbacks[0]();assert.equal(el('coverage').dataset.state,'delayed');assert.match(el('coverage').textContent,/Data aging/);
api.begin('coverage','AgentOne|day1');assert.match(el('coverage').textContent,/last fetched/);
api.fail('coverage','AgentOne|day1');assert.equal(el('coverage').dataset.state,'failed');assert.match(el('coverage').textContent,/last fetched/);
api.begin('coverage','AgentTwo|day1');assert.doesNotMatch(el('coverage').textContent,/last fetched/,'No prior session freshness leaks');
api.fail('coverage','AgentTwo|day1');assert.match(el('coverage').textContent,/no snapshot/);
api.waiting('store','Admin|POD2');assert.equal(el('store').dataset.state,'waiting');
api.success('store','Admin|POD2');assert.equal(el('store').dataset.state,'fresh');
api.waiting('store','Admin|POD3');assert.doesNotMatch(el('store').textContent,/last fetched/,'Old POD report cannot masquerade as new');
api.success('confirmation','test');assert.equal(el('confirmation').dataset.state,'fresh');
api.reset('confirmation');api.repaint('confirmation');assert.match(el('confirmation').textContent,/Waiting/);
console.log('PASS UX9: verified dashboard refresh, failed/stale indicators, account/POD resets, no new fetch/storage, separate Tracker acknowledgment semantics');
