# TrinoTime M2.9.53 - Edit the 100% Performance Cap in VS Code

This is a **STAGING-only** development release based on verified M2.9.52. It is NOT deployed. App version stays V2.0.3; milestone advances to M2.9.53. Production V2.0.5 is untouched.

## Use both versions side by side

1. KEEP your working copy at `C:\Dev\Trinotime\Staging` — it already has the correct `wrangler.staging.jsonc`, `.dev.vars`, and local login.
2. Make a backup of that folder (but never upload or share `.dev.vars`).
3. Extract the M2.9.53 ZIP to `C:\Dev\Trinotime\Review-M2953`, NOT over the active Staging folder.
4. In VS Code open the working Staging folder. Open the corresponding M2.9.53 file using **File -> Open File**. Right-click the working tab and **Select for Compare**; right-click the M2.9.53 tab and choose **Compare with Selected**.
5. Copy and understand each changed section. The full unified patch is `docs/qa/M2953-PERFORMANCE-100-CAP.patch`.
6. Your own edits will hot-reload at `http://127.0.0.1:8790` when the **TrinoTime: Start Local Staging** task is running. Hard-refresh if needed.
7. Never copy `wrangler.jsonc` over `wrangler.staging.jsonc`; never copy `.dev.vars`, Firebase keys, or production credentials. This release intentionally does not bundle those secrets.

## A simple first edit: Coverage daily target progress

File: `cloudflare/public/assets/js/j-coverage-dashboard-rc20.js`.

Find (Ctrl+F):

```javascript
const progress=target?Math.round((submitted/target)*100):0;
```

Change to:

```javascript
const progress=target?Math.min(100,Math.max(0,Math.round((submitted/target)*100))):0;
```

Save (Ctrl+S) and refresh your local Coverage view. For 600 / 300 submitted, you should still see 600 submitted tasks, but progress will read **100%**, not 200%. This is UI display only.

## Edit the core Agent Metrics / Coverage / Confirmation efficiency scoring

File: `cloudflare/src/worker.js`:

- Next to `qcMetricGradeServer` add the `qcMetricCapPercentServer(value)` helper exactly as in the packaged source.
- In `qcMetricRowServer`, change the `efficiencyPercent` calculation to call that helper.
- In `qcMetricSummaryServer`, cap each workflow's earned milliseconds (`Math.min(measuredActiveMs, measuredTasks * targetSeconds * 1000)`) **before** calculating the scope average. Don't cap raw time and don't change job/task count persistence.
- In `qcMetricsShiftsServer`, create `displayShifts` containing capped copies of previously locked row percentages and use it in the returned response. This keeps immutable shift scorecards unchanged in Firebase.

File: `cloudflare/public/assets/js/j-agent-metrics-rc22.js`:

- Add `capScore(value)` next to `gradeFor`.
- Use capped contributions in `summarize` so fallback/filtered aggregates agree with the server.
- Apply `capScore` to rendered scorecards, Coverage-vs-Confirmation cards, POD comparisons, Agent rows, and historical shift labels. The source package shows all exact edits.

File: `cloudflare/public/index.html`: add `&score-cap-m2953=1` to the two modified dashboard JavaScript URLs to avoid stale browser caching.

File: `cloudflare/public/version.json`: update the staging fingerprint so version polling can detect the new build.

## Staging tests in VS Code PowerShell

From your working Staging folder:

```powershell
cd "C:\Dev\Trinotime\Staging\cloudflare"
npm.cmd run check
npm.cmd run qa:sync
```

**Do not** run a staging deployment while learning. Compare, edit, save, test locally. If you later want to test with Cloudflare online staging, back up state and first verify config/bindings. Do not touch the live website.

## Expected values and limitations

- 150% / 200% measured efficiency => 100% *displayed* Agent score.
- A–F grading unchanged; missing timing or target stays ungraded, not 0%.
- Combined Agent/POD/team percentages remain **active-time-weighted**, but with per-workflow score contributions capped first; they're not a simple average of all Agents.
- Coverage daily submission target percentage stops at 100%. Actual submitted / target counts remain visible and unchanged.
- Confirmation's performance percentage is shown in Agent Metrics; Confirmation interval/EOD counts stay unchanged.
- **Do not cap** meaningful pace-difference descriptions (e.g. '200% slower than target'), time, task totals, or nonperformance rates. These describe different facts.
- Older immutable scorecards aren't rewritten; their display/API response is capped.
- All tests are automated; staging runtime and Microsoft Excel still need user verification after actual deployment.

## Important files

1. `cloudflare/public/assets/js/j-coverage-dashboard-rc20.js` — simplest UI change to practice.
2. `cloudflare/src/worker.js` — server efficiency and bounded aggregate calculation.
3. `cloudflare/public/assets/js/j-agent-metrics-rc22.js` — performance display and fallback summaries.
4. `cloudflare/scripts/metrics-score-cap-m2953-regression.mjs` — tests for 150/200%, mixed agent/workflow contributions, and count integrity.
5. `.vscode/tasks.json` — optional local launcher task, preconfigured with PowerShell's per-process policy override. Only use scripts you've reviewed and trust.

**The packaged source is your known edited reference. Your VS Code staging folder stays your personal experiment.**
