import fs from 'node:fs';
import assert from 'node:assert/strict';

const coverage=fs.readFileSync(new URL('../../tracker/coverage.js',import.meta.url),'utf8');
const bg=fs.readFileSync(new URL('../../tracker/coverage-background.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../../tracker/manifest.json',import.meta.url),'utf8'));

assert.equal(manifest.version,'2.2.32','Tracker release must be v2.2.29');
assert(coverage.includes('function finalSubmitPending()'),'Final-task pending Submit helper is required');
assert(coverage.includes("if(!finalSubmitPending()) chrome.runtime.sendMessage({type:'cat-mode-leave'})"),'Coverage mode leave must be deferred while final Submit verification is pending');
assert(coverage.includes('if(routeMismatch&&finalSubmitPending())'),'A fast Augmoto Home/Jobs redirect must be handled before the normal non-Coverage early return');
assert(coverage.includes("payload.event?.confirmedBy==='final-home-transition'&&finalSubmitPending()"),'Only the trusted final-home transition may bypass the temporary mode mismatch guard');
assert(coverage.includes("confirmPendingSubmit('final-home-transition',true)"),'Final Home/Jobs transition must confirm the pending Submit and then leave Coverage mode');
assert(coverage.includes('function coverageLandingVisible(text)'),'Final-task confirmation must use positive Augmoto landing-page signals');
assert(coverage.includes("const hasHome=/\\bHome\\b/i.test(body)&&/\\bMy Tasks\\b/i.test(body)"),'Augmoto Home landing signal must be recognized');
assert(coverage.includes("const hasFilters=/\\bFilters\\b/i.test(body)&&/\\bStore\\b/i.test(body)"),'Augmoto Jobs/Filters landing signal must be recognized');
assert(coverage.includes("if(!result?.ok){p.confirming=false;scheduleScan(500);return;}"),'Confirmed Submit intent must remain retryable until the background acknowledges it');
assert(coverage.includes("confirmPendingSubmit(h.jobId!==pending.submit.jobId?'new-job-transition':'task-advance')"),'Normal same-job and cross-job Submit transitions must use acknowledged confirmation too');
assert(coverage.includes("confirmPendingSubmit('coverage-queue')"),'Coverage queue final-submit path must use acknowledged confirmation');
assert(coverage.includes("confirmPendingSubmit('route-navigation')"),'Route-navigation fallback must use acknowledged confirmation');
assert(bg.includes("case 'submit-confirmed':")&&bg.includes('if (task && !task.submitted)'),'Background must remain idempotent so retries cannot double-count a task');
assert(bg.includes('s.submitted++; if (job) job.submitted++;'),'A verified task Submit must increment exactly once');

// Guard the false-positive boundary: only a real pending final task qualifies.
const finalPending=(p)=>Boolean(p?.jobId&&(Number(p.taskIndex)||0)>0&&(Number(p.totalTasks)||0)>0&&(Number(p.taskIndex)||0)>=(Number(p.totalTasks)||0));
assert.equal(finalPending({jobId:'JOB_1',taskIndex:12,totalTasks:12}),true);
assert.equal(finalPending({jobId:'JOB_1',taskIndex:11,totalTasks:12}),false);
assert.equal(finalPending({jobId:'JOB_1',taskIndex:12,totalTasks:0}),false);
assert.equal(finalPending(null),false);

console.log('PASS Tracker v2.2.29 Coverage final-submit hotfix: fast Home/Jobs redirects preserve pending Submit, require a positive landing signal, wait for background acknowledgement, and remain exactly-once/idempotent.');
