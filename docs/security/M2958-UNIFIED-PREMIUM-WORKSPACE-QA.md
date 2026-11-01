# M2.9.58 Staging QA — Unified Premium Appearance

## Goal and boundary
All **verified** workforce users (Agent, TL, Admin) get the existing Premium visual layout. CSS/edition flags are not security grants. No role, pod, credential, security-rule or Worker access policy was loosened. Login gate is unchanged.

## Deployment (STAGING only)
1. Retain a safe copy of M2.9.57, and export the current staging RTDB rules.
2. Extract into a NEW folder. Supply the known-good staging-only `cloudflare/wrangler.staging.jsonc` and staging-only secrets locally. Never use the bundled production reference `cloudflare/wrangler.jsonc`.
3. Node 22+: `cd cloudflare`; `npm install`; `npm run check`; `npm run qa:sync`; `npm run staging:preflight`; `npm run deploy:staging`. Alternatively review `STAGING-DEPLOY.ps1` before use.
4. Hard refresh the staging Worker and check `version.json` build fingerprint M2.9.58. The displayed application version remains `2.0.3` intentionally.

## Manual acceptance
- Agent (including no Premium entitlement): Premium shell on first reveal, own schedule/profile only, punch and messaging work; unauthorized TL/Admin actions remain blocked server-side.
- TL (including former Standard entitlement): Premium shell, proper assigned POD/team, attendance, reset UI, shift updates and messaging work.
- Admin: Premium shell and authorized admin tools work.
- Switch tabs away/back and refresh/reconnect: no Standard/Premium flip.
- Sign out/in as different role: no stale layout/session data leaks.
- Check dark/light theme, mobile width, performance and accessible modal/tab focus.
- QC Tracker sync and reporting unchanged.
- Simulate untrusted/failed Premium policy API response: outer UI stays Premium but server permissions remain intact.

## Rollback
If roles, Premium shell, attendance or messaging regress, redeploy the previous known-good **M2.9.57 STAGING** ZIP using the same verified staging config. Do not change Firebase RTDB rules during rollback. Browser hard-refresh/version check after rollback.

## Known remaining security issue
`/kv` still grants broad authenticated client reads and has live subscriptions. DO NOT change it to `.read:false` until remaining frontend subscriptions have been migrated to role/POD-scoped Worker APIs and tested. Visual unification does not remediate this.
