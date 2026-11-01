# TrinoTime OOS — RC2 STAGING UX18P46 Bio Break Scroll Hotfix (2026-11-01)

**STAGING QA ONLY — not a production deployment or GitHub `J-Celo/OOS` production replacement.**

Complete staging source derived from RC2 STAGING UX18P37 and forward-ported with the TrinoTime UX18P38–UX18P46 production feature changes. Preserves staging-only runtime isolation, security/authorization, QA roles, Attendance and historical data protections, TrinoBot v1.0.8 staging pilot gates (disabled by default), and the independent staging Tracker v2.2.62.

## Windows 11 PowerShell (inside extracted `cloudflare` folder)

```powershell
npm install
npm run staging:preflight
npm run deploy:staging
```

Staging Worker: `oostrinotime-staging-qa` · Firebase: `trinotime-staging-qa` · R2: `trinotime-chat-files-staging`. The default Wrangler configuration is staging-only; production deployment scripts remain blocked. Firebase staging rules are provided as reference only; **none are applied automatically**.

**New feature parity**: 70 s/task automatic Coverage/Confirmation defaults from 2026-10-28, protected retrospective display for eligible locked scores, QA grading scope, friendlier Agent Metrics, reduced dashboard rendering work, organized Attendance Log with fixed dropdown layering, improved hourly-rate edit controls, and the **Admin-only read-only Sync Guardian V1**. Do not treat missing browser-local records as proof of lost submissions.

**Tracker scope**: The staging Tracker remains **v2.2.62**, using staging URLs only. It incorporates the v2.3.10 counting baseline plus the reviewed v2.3.11 Confirmation recovery behavior ported to the staging identity. Production Chrome Web Store v2.3.11 remains separate / under review; do not install a production-host Tracker in staging or clear storage. Extension testing must use an approved isolated staging browser/profile.

**Validation scope**: Local regression/preflight checks cannot prove live staging behavior or performance; staging has no real production roster. Following a successful deployment, verify Admin Sync Guardian, grading, Attendance editor/navigation and Tracker compatibility with authorized staging accounts. Do not copy production Firebase employee data, secrets or auth credentials into staging.

**November 1 Bio Break fix:** Bio Break report remains centered when scrolling through many records. A scoped CSS rule prevents the global active-scroller optimization from canceling the modal centering transform. No Attendance records, roles, API, bio-break timers, search or dates changed. Production remains untouched.

## Collaborative staging development — VS Code + private GitHub

This package can be shared through a **separate private** GitHub repository named `J-Celo/OOS-STAGING`. Never add a production remote or deploy from this repo to `J-Celo/OOS`.

- In the staging root, run the **one-time** `SETUP-STAGING-COLLAB.ps1` from PowerShell. It requires Git and an authenticated GitHub CLI (`gh`) to create the private repo and push staging source. If `gh` is unavailable, the script shows a safe manual fallback. It never installs software or requests your password.
- Keep the repo **private**. The owner can invite a trusted collaborator through GitHub **Settings → Collaborators**. Friend clones `J-Celo/OOS-STAGING` into VS Code, creates a feature branch, and opens a PR for review. The friend does **not** receive Cloudflare, Firebase, GitHub production or Admin credentials.
- For same-time editing, both install the VS Code extension **Microsoft Live Share**; the owner starts a Live Share session and sends the invite link privately. Never share a writable terminal or debug session; Live Share hosts can read/open source available to the shared session.
- The original `CURRENT-STAGING-RULES.json` is intentionally excluded from the shared package because it contains employee-specific rules. The owner may keep their existing local copy privately for specialized offline security tests. It must not be committed. Ordinary `cloudflare` staging preflight is unaffected.
- All normal staging development uses **only** the staging Worker and staging Firebase. Owner alone deploys from the approved staging branch by running inside `cloudflare`: `npm install`, `npm run staging:preflight`, `npm run deploy:staging`. Changes in a developer branch do **not** auto-deploy.
- When approved for production, still deliver a complete, clean production ZIP and use the owner's existing **GitHub Desktop → J-Celo/OOS** workflow. Never link this staging repo to production deployment.
