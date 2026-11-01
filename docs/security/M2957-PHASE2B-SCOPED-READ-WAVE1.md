# M2.9.57 — Staging Phase 2B, Wave 1: authenticated receipt reads

**Status: PARTIAL MIGRATION — `/kv` is STILL readable by any authenticated Firebase user. DO NOT publish stricter `/kv` rules.**

## Origin and scope

Source baseline: M2.9.56 Phase 2A, itself based on M2.9.55 corrected staging QA. All existing UI, QC Tracker v2.2.32, Worker routing, and Firebase Security Rules proposals are preserved. Only the existing primary browser JS is modified for data-access behavior; Worker/frontend fingerprints and JS cache-buster are updated so the staging browser can load the change. No deployment, credentials, database export, migration, or actual Firebase Rules modification is performed by this package.

### Concrete code migrations

- `loadPremiumAccessPolicy`: removes the direct anonymous-or-regular-Firebase `/kv/premium_access_policy_v1` read, including its misleading `server-confirmed` trust state. Premium policy may now be trusted only through the role-validated Governance Worker (`/api/workforce/governance/premium-policy`). On API failure, cached Premium policy cannot grant Premium access (Standard fail-closed). This can temporarily display Standard during secure login or service errors; validate actual Agent and TL Premium access during staging QA.
- `verifyPunchReceiptOnServer`: obtains the current receipt via the scoped Attendance Worker (`GET /api/workforce/attendance/record?key=...`), which independently checks signed-in identity and allowed POD. Exact `_syncPunchIds` and timestamp matching remain in place.
- `verifyAttendancePayloadOnServer`: routes through the same scoped Attendance endpoint, replacing direct Firebase `get`. This existing helper has no call sites in the reviewed client bundle, but is hardened for potential future use.
- `verifyVersionedPayloadOnServer`: used by shift-override remote confirmation. It now validates through the scoped Schedule Worker (`GET /api/workforce/schedule/record?key=...`), and rejects non-Schedule keys.
- No generic `/kv` read proxy is introduced: that could accidentally recreate the same exposure on the Worker.

### Baseline migration remains unfinished

Firebase `"kv": {".read":"auth != null",".write":false}` is still **overly permissive**. The browser's full-tree `/kv` listeners (child_added, child_changed, child_removed and bootstrap value) remain intact; local generic reads and admin history/purge reads also still depend on `/kv`. `agentPresence` remains broadly readable. Seven approved identity bindings do not establish Vault-Only readiness; do not enable Vault-Only until the existing dry-run preview and login recovery are validated.

## Safe testing — BEFORE staging deployment

1. Keep a safe copy of the deployed M2.9.55 Worker and current **staging** Firebase rules, plus a protected staging-only data backup.
2. Use existing dedicated staging Wrangler configuration `wrangler.staging.jsonc` and staging-only credentials, **never** the package's production-reference `wrangler.jsonc`.
3. `cd cloudflare`; run `npm.cmd run check`, `npm.cmd run qa:sync`, `npm.cmd run security:kv:phase2b`, `npm.cmd run security:preflight:test`. Do not paste `.dev.vars`, secret bindings, or employee records into chat.
4. Confirm staged Worker uses the expected Firebase project `trinotime-staging-qa` and the existing published staging `serverTimeAudit` deny rules. The ZIP's rules are reference files, not a trigger to publish.
5. **Only after user approval**, deploy to staging and test: Agent Premium authorization following fresh login; TL Premium on/off changes; Agent punch and Time Out receipt; TL shift-assignment remote receipt including cross-POD forbidden case; Admin and TL dashboards; realtime attendance; QC Tracker, chat and Excel reporting. Check browser console and Cloudflare Worker logs. If the secure Governance endpoint is slow/unavailable, confirm Premium gates fail closed and recover after retry/login.
6. Compare results to M2.9.55. Roll back the Worker to the last known-good M2.9.55 deployment if login, Premium access, shift assignment, or attendance receipts regress. **No RTDB rules rollback is needed for this release** because it proposes no new rules change.

## Next Wave 2B2 (not delivered here)

Design a role-scoped invalidation/update transport and replace the root `/kv` realtime listener, one functional family at a time, with carefully tested server-projected responses. Only after all direct client `/kv` reads are removed and emulator, E2E, mobile and Tracker checks pass should the owner publish `.read: false` for `/kv` on **staging**. Production remains entirely untouched.

## QA status

Automated offline application regression: PASS; Tracker sync regression: PASS; M2.9.56 readiness tests: PASS; 8 M2.9.57 scoped-read static checks: PASS. These static and synthetic tests do **not** establish live staging correctness or prove that the broader `/kv` vulnerability is closed.
