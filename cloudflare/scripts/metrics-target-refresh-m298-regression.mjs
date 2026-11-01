import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const metrics=fs.readFileSync(new URL('../public/assets/js/j-agent-metrics-rc22.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');

assert(metrics.includes("window.__ttMetricsTargetRefreshBuild='M2.9.8'"),'M2.9.8 metrics target/refresh marker');
assert(metrics.includes("$('ttMetricsRefresh').onclick=()=>manualMetricsRefresh()"),'Refresh button uses explicit feedback refresh path');
assert(metrics.includes("setMetricsRefreshFeedback('Refreshing…',true)"),'Refresh gives visible in-flight feedback');
assert(metrics.includes("setMetricsRefreshFeedback(ok?'Refreshed ✓':'Refresh failed',false)"),'Refresh gives visible completion feedback');
assert(metrics.includes("Combined grading requires targets for every measured workflow."),'Target save explains combined workflow requirement');
assert(metrics.includes("Locked Time Out scorecards are immutable. Use Historical date"),'Locked-shift target behavior is explained');
assert(metrics.includes("return 'Target required'"),'Measured data with missing targets is labeled as target-required, not awaiting data');
assert(metrics.includes("Missing ${trulyMissingTargets.map(targetJobLabel).join(' + ')} target"),'Missing workflow target is named explicitly');
assert(worker.includes('missingTargetJobs'),'Server aggregate returns missing workflow targets for full authorized scope');

const start=metrics.indexOf('function capScore('),end=metrics.indexOf('function duration(');
assert(start>=0&&end>start,'summarize helper present');
const summarizeSource=metrics.slice(start,end);
const summarize=vm.runInNewContext(`(function(){const gradeFor=s=>s===null?'NA':s>=100?'A':s>=80?'B':s>=60?'C':s>=40?'D':'F';${summarizeSource};return summarize;})()`);
const coverageOnly=summarize([{name:'A',job:'coverage',submitted:10,measuredTasks:10,measuredActiveMs:600000,target:{secondsPerTask:60},efficiencyPercent:100,lastSyncAtMs:1}]);
assert.equal(coverageOnly.grade,'A');
assert.deepEqual(Array.from(coverageOnly.missingTargetJobs),[]);
const combined=summarize([
 {name:'A',job:'coverage',submitted:10,measuredTasks:10,measuredActiveMs:600000,target:{secondsPerTask:60},efficiencyPercent:100,lastSyncAtMs:1},
 {name:'A',job:'confirmation',submitted:5,measuredTasks:5,measuredActiveMs:300000,target:null,efficiencyPercent:null,lastSyncAtMs:1}
]);
assert.equal(combined.grade,'NA','Combined grade stays withheld when a measured workflow has no target');
assert.deepEqual(Array.from(combined.missingTargetJobs),['confirmation']);

console.log('PASS M2.9.8 Metrics target/refresh UX: visible refresh state, workflow-specific missing-target diagnostics, locked-scorecard explanation, and truthful combined grading.');
