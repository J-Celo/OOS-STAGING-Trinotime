import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const metrics=read('../public/assets/js/j-agent-metrics-rc22.js');
const profile=read('../public/assets/js/j-5a9b0d9aeabc.js');
const admin=read('../public/assets/js/j-v1191-admin-command-center.js');
const css=read('../public/assets/css/c-staging-coverage-intelligence-v2.css');
const html=read('../public/index.html');
function includes(source,marker){assert(source.includes(marker),`Missing protected V2 feature: ${marker}`);}
for(const marker of ['tt-v2-scorecard','tt-v2-letter','tt-v2-disclosure','tt-v2-presence','tt-mx-activity-grid','tt-mx-reach-section','tt-mx-shifts','tt-mx-roster',"grade==='NA'?'—':grade","grade==='NA'?'Not graded':gradeLabel(grade,summary)"]){includes(metrics,marker);}
for(const label of ['Retained Create','Retained Person','Product Match','Delete','No Match','Submitted'])includes(metrics,label);
for(const marker of [
  'window.TrinoTimeMetricsProfileGradeMount=',
  'window.TrinoTimeMetricsInspectorGradeMount=',
  "normalizedRole(viewer?.role)!=='agent'",
  "normalizedRole(d.viewer?.role)!=='agent'",
  "normalizedRole(d.viewer?.role)!=='admin'",
  "d.scope!=='self'",
  "d.scope!=='all-pods'",
  "d.authority!=='workforce-metrics-v1'",
  "summarize(coverage).grade",
  "summarize(rows).grade",
  "api('shifts?range=current&offset=0'",
  "api('shifts?range=current&offset=0&agent='",
  "'Coverage grade · Not graded'",
  "'Coverage grade · Unavailable'"
])includes(metrics,marker);
includes(profile,'window.TrinoTimeMetricsProfileGradeMount(host, agentName)');
includes(admin,'window.TrinoTimeMetricsInspectorGradeMount(body, name)');
for(const marker of ['#ttAdminOverviewPanel','#ttMetricsRoot .tt-v2-scorecard','#ttMetricsRoot .tt-v2-disclosure','body.dark-mode','@media (max-width:650px)','prefers-reduced-motion'])includes(css,marker);
includes(html,'c-staging-coverage-intelligence-v2.css?v=20261022-production-parity');
assert(!metrics.includes('grade===\'NA\'?\'A\''),'No invented fallback grade A');
console.log('PASS staging Overview V2: compact metric groups, all six retained counters, responsive/dark styling, real grade display, self-profile and authorized Admin inspector grade, unavailable states, no scoring mutations');
