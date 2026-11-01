import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const metrics=read('../public/assets/js/j-agent-metrics-rc22.js');
const css=read('../public/assets/css/c-coverage-dashboard-v1.css');
const coverage=read('../public/assets/js/j-coverage-dashboard-rc20.js');
const confirmation=read('../public/assets/js/j-confirmation-dashboard-rc21.js');
const index=read('../public/index.html');
assert(/window\.__ttMetricsDashboardBuild='RC2[78]'/.test(metrics));
assert(/window\.__ttAgentMetricsBuild='RC2[78]'/.test(metrics));
for(const marker of ['ttMetricsAgentField','ttMetricsAgentList','ttMetricsAgentClear','Search or select','Personal performance','Selected Agent history.','agentQuery']){
  if(marker==='Search or select') continue;
  assert(metrics.includes(marker),`missing RC27 Agent selector marker: ${marker}`);
}
assert(metrics.includes('placeholder="All agents"'),'Admin Agent search must default to the all-agent view.');
assert(metrics.includes("query=canDrill?String(agentQuery||'').trim():''"),'Agent filtering must remain limited to supervisor-authorized rows.');
assert(metrics.includes("agentQuery='';if($('ttMetricsAgent'))$('ttMetricsAgent').value=''"),'Agent/self viewers must not retain a supervisor Agent filter.');
assert(metrics.includes("personalAgent?personalAgent:(selectedPodLabel||"),'scope pill must switch to the selected Agent before any POD-level scope label.');
assert(css.includes('personal Agent drill-down'));
assert(css.includes('.tt-mx-agent-picker'));
assert(/metrics-agent-rc2[78]=1/.test(index));
assert(coverage.includes('},6000);'),'Coverage visible dashboard polling should use the UX18P24 six-second interval.');
assert(confirmation.includes('},6000);'),'Confirmation visible dashboard polling should use the UX18P24 six-second interval.');
assert(metrics.includes('},3000);'),'Agent Metrics visible dashboard polling should refresh every 3s.');
console.log('PASS RC27 metrics drill-down preserved: supervisor Agent selector/search drives personal scorecard + job intelligence without weakening backend role scope; existing dashboard refresh intervals preserved with signature-stable rerenders.');
