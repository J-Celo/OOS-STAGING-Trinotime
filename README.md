# TrinoTime OOS — RC2 STAGING Tracker v2.2.63 (2026-11-06)

**STAGING QA ONLY — not a production deployment or GitHub `J-Celo/OOS` production replacement.**

Complete staging source derived from RC2 STAGING UX18P37 and forward-ported with the TrinoTime UX18P38–UX18P46 production feature changes. Preserves staging-only runtime isolation, security/authorization, QA roles, Attendance and historical data protections, TrinoBot v1.0.8 staging pilot gates (disabled by default), and the independent staging Tracker v2.2.63.

## Windows 11 PowerShell (inside extracted `cloudflare` folder)

```powershell
npm install
npm run staging:preflight
npm run deploy:staging
```

Staging Worker: `oostrinotime-staging-qa` · Firebase: `trinotime-staging-qa` · R2: `trinotime-chat-files-staging`. The default Wrangler configuration is staging-only; production deployment scripts remain blocked. Firebase staging rules are provided as reference only; **none are applied automatically**.

**New feature parity**: 70 s/task automatic Coverage/Confirmation defaults from 2026-10-28, protected retrospective display for eligible locked scores, QA grading scope, friendlier Agent Metrics, reduced dashboard rendering work, organized Attendance Log with fixed dropdown layering, improved hourly-rate edit controls, and the **Admin-only read-only Sync Guardian V1**. Do not treat missing browser-local records as proof of lost submissions.

**Tracker scope**: Staging Tracker **v2.2.63** incorporates production Tracker v2.3.20 feature parity, retaining staging-only URLs and identity. This includes protected Coverage/Confirmation submission receipts, non-starving background synchronization, 30-second off-tool grace, store-search time, dual-monitor-friendly activity classification, cross-tab ownership, reconnect recovery and reduced page scans. It is **not** the production Chrome Web Store package. Use an isolated staging browser profile; do not clear active extension storage.

**Validation scope**: Local regression/preflight checks cannot prove live staging behavior or performance; staging has no real production roster. Following a successful deployment, verify Admin Sync Guardian, grading, Attendance editor/navigation and Tracker compatibility with authorized staging accounts. Do not copy production Firebase employee data, secrets or auth credentials into staging.

**November 1 Bio Break fix:** Bio Break report remains centered when scrolling through many records. A scoped CSS rule prevents the global active-scroller optimization from canceling the modal centering transform. No Attendance records, roles, API, bio-break timers, search or dates changed. Production remains untouched.

## Collaborative staging development — VS Code, branches and Live Share

**Staging repository (keep private):** `J-Celo/OOS-STAGING-Trinotime` (NOT `J-Celo/OOS`). The initial GitHub repository is already created. **Do not rerun `SETUP-STAGING-COLLAB.ps1` or initialize another Git repository.**

### Branch workflow

- `main` — owner-reviewed, deployable STAGING source only. **Never push development directly to `main`.** No connection to production.
- `develop` — staging integration branch. Merge reviewed feature PRs here first; owner tests before proposing `develop` → `main`.
- `feature/agent-metrics` — reserved for the owner's Agent Metrics UI work.
- `feature/attendance-ui` — reserved for Jerry's Attendance and Bio Break UI work.
- For additional work, create new `feature/<short-topic>` branches from updated `develop`. Avoid editing each other's feature branch unless coordinating in Live Share.

### Each change

1. Fetch/pull the latest `develop` before starting a new feature branch. Commit only the related source and test changes.
2. Push the feature branch and open a **pull request to `develop`**. Explain the change, tests, UI screenshots if helpful, and security/data impact.
3. Owner reviews and merges the PR after relevant regression checks. **No direct merges to `main` by collaborators.**
4. When several changes are accepted, owner opens/reviews a **PR from `develop` to `main`**, runs staging preflight, and merges.
5. Owner alone deploys staging from `main` using `npm install`, `npm run staging:preflight`, `npm run deploy:staging` inside `cloudflare`. No production deployment from this repository.

### Live Share

Use Live Share while both people are online, ideally on a **feature branch**. Share only the source editors needed; do not grant writable terminals, secrets, production accounts or privileged debug access. Agree who commits shared edits to avoid double commits. Jerry must accept his private repo invitation before independent Git access.

### Safety

Never commit production credentials, `.env`, `.wrangler`, `node_modules`, local Firebase private rule snapshots or employee data. Keep the repo private. Test with synthetic staging accounts. Existing `.gitignore` protects common local files; review the staged Git diff before pushing. `J-Celo/OOS` production remains owner-controlled through GitHub Desktop and one complete clean production ZIP.
