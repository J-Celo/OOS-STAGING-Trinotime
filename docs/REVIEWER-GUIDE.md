# TrinoTime — read-only technical reviewer guide

This is the shortest safe path to evaluate the **real source** without accessing production workforce data or deploying code.

## Choose the right source before reviewing

- **Stable source snapshot:** [`main`](../cloudflare/) is V2.0.5 as recorded on 9 October 2026. Its scripts, fixtures, and frontend are the baseline for the steps below.
- **Additional code under review:** [Security integration PR #3](https://github.com/J-Celo/OOS/pull/3) contains newer, unmerged engineering work; inspect its code and CI independently.
- **Staging archive inspection:** [RC2 reconciliation PR #4](https://github.com/J-Celo/OOS/pull/4) records the owner's separate RC2 archive and test findings. **It is documentation-only so far and does not contain synchronized runtime code.**
- **Project status and open acceptance tasks:** [October 17 progress report](REVIEWER-STATUS-2026-10-17.md).

Do not assume these code lines are identical or deployed just because a version number or test passed.

## Suggested review order (10–20 minutes)

1. Read the [project README](../README.md) to identify the current Worker-hosted application versus legacy root files.
2. Read the [architecture overview](ARCHITECTURE.md) to understand the Worker / Firebase / Tracker boundaries.
3. Inspect server authorization and API handling in [`cloudflare/src/worker.js`](../cloudflare/src/worker.js).
4. Review [Tracker sync hardening](../cloudflare/scripts/tracker-sync-hardening-m2927-regression.mjs) and [Excel output compatibility](../cloudflare/scripts/excel-chart-compat-m2952-regression.mjs).
5. Follow the offline test steps below, then review [security limitations](SECURITY-REVIEW.md).

## Automated offline checks

**Requirements:** Node.js 22+, Git, and an available ZIP extractor (PowerShell `Expand-Archive` on Windows, `unzip` on macOS/Linux).

From the repository root, on **Windows PowerShell**:

```powershell
node .\cloudflare\scripts\reviewer-prepare.mjs
cd .\cloudflare
npm.cmd run check
npm.cmd run qa:sync
npm.cmd run production:preflight
```

On Unix-like systems use `node cloudflare/scripts/reviewer-prepare.mjs` and `npm`. The helper verifies the SHA-256 of `cloudflare/public/downloads/TrinoTime-QC-Tracker-v2.2.33.zip`, then reconstructs `tracker/` locally because existing regressions expect that directory. It is safe to rerun without overwriting an existing matching fixture.

The [GitHub Actions workflow](../.github/workflows/reviewer-regression.yml) runs the equivalent checks on new pull requests using an ephemeral checkout with **read-only GitHub contents permission** and no production credentials. A green test demonstrates passing supported source and fixture regressions, **not** a certified live penetration test, browser acceptance test, or third-party validation.

## Where to find the implementation

| Topic | Source |
| --- | --- |
| Core Worker API | `cloudflare/src/worker.js` |
| Production/staging separation | `cloudflare/src/deployment-isolation.js` |
| Active frontend | `cloudflare/public/` |
| Coverage display | `cloudflare/public/assets/js/j-coverage-dashboard-rc20.js` |
| Agent Metrics | `cloudflare/public/assets/js/j-agent-metrics-rc22.js` |
| Excel reporting | `cloudflare/public/assets/js/j-report-exports-m2935.js` |
| QC Tracker source | Checksum-verified Tracker ZIP, extracted locally into `tracker/` |
| Legacy site and migration files | [Legacy layout explanation](LEGACY-LAYOUT.md) |

## Safe boundaries

- Do **not** run `npm run deploy`, `wrangler deploy`, or a credentialed local Worker with `cloudflare/wrangler.jsonc`: it references production resources.
- Do **not** request production Firebase credentials, real workforce records, or real employee exports to review the code.
- Use **synthetic sample data** if demonstrating user flows. Live site access should be a separately authorized demo, not a prerequisite for a code review.
- The Firebase rules file in the root is a **historical migration artifact**, not a representation of current deployed rules.
- A private GitHub **Read** role allows cloning the source and its reachable history; it does not protect the repository's contents from being downloaded.
- This is a source-review snapshot; the original personal Git repository and the organization-owned review mirror can diverge after their last synchronization.

## What is still technical debt?

Some large Worker and frontend modules could be modularized later. Dependencies and older GitHub Pages files remain in historical commits. Reviewers should identify concrete risks and testable improvements rather than treating the visual appearance of the root file list as evidence that the currently deployed application is identical to those older files.
