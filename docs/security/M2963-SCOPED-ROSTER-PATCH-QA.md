# M2.9.63 — Scoped roster edits, Wave 2 (staging only)

## Security objective

Adds `PATCH /api/workforce/roster/employees/scoped-patch`. Verified Agent/TL clients submit one rename or TL same-team POD transfer intent, not the entire cross-POD employee document. The Worker checks its canonical roster, validates current actor role/POD, composes a **complete internal** roster from the authoritative server snapshot and delegates to the existing compare-and-set/version checked roster writer. The response strips all employee documents, including conflicts.

Supported request fields: `operation` (`rename` or `transfer`), `targetName` (TL only), `newName` (rename), `newPod` (TL transfer), `baseVersion`, `targetVersion`, `mutationId`. Existing Worker authentication required: `X-TT-Security-Session` or Firebase bearer credentials. **Never disclose either token.** Agents may rename only themselves. TLs may edit only Agent records currently in their verified POD; transfers can go only to another POD in the same verified organizational team. Unknown fields and unverified secure roster state fail closed.

**This build introduces the server contract but deliberately DOES NOT switch existing frontend roster edits to it yet.** Switching to a filtered roster without migrating all edit paths can silently overwrite users in other PODs. The legacy full snapshot/PUT endpoints and broad Firebase `/kv` reads remain accessible. **The main `/kv` security issue is NOT fixed.** This is the second backend migration wave, not a final authorization/security certification.

## Offline QA

From `cloudflare` using Node 22+: `npm run security:roster:scoped-patch`, `npm run check`, `npm run qa:sync`. All use synthetic records only.

## Staging QA before release

1. Save known-good M2.9.62 staging package and verified `wrangler.staging.jsonc`. The bundled `cloudflare/wrangler.jsonc` is a **PRODUCTION reference; do not deploy it**.
2. Only deploy using `STAGING-DEPLOY.ps1` or verified `npm run deploy:staging` with the staging-only configuration and environment preflight. Do not change Firebase rules or data.
3. Test Agent/TL/Admin existing attendance, roster edits, transfers, messaging, Premium UI, Tracker live sync. They intentionally still use their old request contract.
4. A qualified developer can test the new `PATCH` against staging **test Agent records only**, using a private authorized session and a current canonical baseVersion. Never paste headers, employee documents or tokens into chat. Expect 403 on unauthorized actor/cross-team attempts; 409-style conflict is expressed as `conflict:true` when the server's version changes; sensitive roster documents must never be returned. Avoid using this to rename real users until the UI client is fully migrated.
5. Proceed to frontend read/write migration only after staging tests and an explicit data-safe rollback plan.

## Rollback

Re-deploy last known-good M2.9.62 staging Worker with the same verified staging configuration. New endpoint is additive; it does not rewrite any data merely by being deployed. No production deployment, Firebase rule edits, credential cleanup, or Vault-Only changes are part of this release.
