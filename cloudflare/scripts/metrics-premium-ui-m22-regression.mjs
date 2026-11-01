import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const metrics=read('../public/assets/js/j-agent-metrics-rc22.js');
const css=read('../public/assets/css/c-coverage-dashboard-v1.css');
const index=read('../public/index.html');
for(const marker of [
  'tt-mx-activity-section','tt-mx-activity-grid','tt-mx-reach-section','tt-mx-reach-mark','tt-mx-presence-grid',
  "'Retained Create','cyan'","'Retained Person','violet'","'Product Match','green'","'Delete','rose'","'No Match','amber'","'Submitted','gold'",
  "'Submitted',whole(summary.totalSubmitted),'Completed task submissions','gold'",
  "'Measured tasks',whole(summary.totalMeasured)",
  "data-job=\"${esc(r.job)}\""
]) assert(metrics.includes(marker),`Missing M2.2 Metrics UI marker: ${marker}`);
for(const marker of [
  'Shift Metrics M2.2 — premium visual-life polish',
  '.tt-mx-stat.is-gold','.tt-mx-stat.is-cyan','.tt-mx-stat.is-violet','.tt-mx-stat.is-green','.tt-mx-stat.is-amber','.tt-mx-stat.is-rose',
  '.tt-mx-activity-section','.tt-mx-reach-section','.tt-mx-roster>.tt-ops-panel-head',
  'body.dark-mode .tt-mx-activity-section','body.dark-mode .tt-mx-reach-section',
  '.tt-ops-job[data-job="coverage"]','.tt-ops-job[data-job="confirmation"]'
]) assert(css.includes(marker),`Missing M2.2 Metrics CSS marker: ${marker}`);
assert(index.includes('metrics-premium-m22=1'),'M2.2 Metrics CSS/JS cache-bust missing');
console.log('PASS Shift Metrics M2.2 premium UI: differentiated KPI accents, Coverage activity colors, goal callout, roster hierarchy, workflow badges, and dark-mode variants');
