# TrinoTime M2.9.64 — Scoped TL transfer, Wave 3: Staging QA

## Purpose and scope

This is a **partial frontend migration** from the legacy full-document employee roster PUT to `PATCH /api/workforce/roster/employees/scoped-patch` for a **single Agent POD transfer initiated by a TL**, provided no recurring Day Off entry requires a corresponding schedule change. The server verifies current TL role/POD and target Agent, rejects destination PODs outside the same organizational group, appends authenticated server-side transfer history, and commits a canonical roster with the existing ETag compare-and-set. The receipt does not include the full employee document.

The frontend verifies the commit with a scoped read and roster receipt before applying it locally. Unknown outcomes do not trigger automatic duplicate writes. The existing full-roster API is still called for compatibility and readback—this release **does not remove cross-POD read exposure**.

## Automated checks (synthetic, no production data)

Run from `cloudflare/` with Node 22+:

```
npm run security:roster:tl-transfer
npm run check
npm run qa:sync
```

All passed at packaging. The 11 new tests cover cross-company rejection, forged history, server-authored history, single-TL frontend PATCH, conflict, unknown network outcome, readback, scoped visibility, and preserved Admin/multi-Agent paths. These offline tests do **not** prove live browser-to-Firebase behavior.

## Deployment preflight

1. Keep a backed-up **known-working M2.9.63** staging ZIP and the last verified staging-only `wrangler.staging.jsonc` in your working folder. Save staging roster/schedule test fixtures and know how to undo a test transfer.
2. Extract M2.9.64 in a new folder. Run `STAGING-DEPLOY.ps1`, supply the path to your current staging `cloudflare` folder, and ensure the preflight confirms Firebase `trinotime-staging-qa` and only staging Worker/R2/Leave bindings. The bundled `cloudflare/wrangler.jsonc` is **production reference**; NEVER deploy with it.
3. If deployment validation fails, stop. No production changes, Firebase rule changes, Vault-Only toggles or `/kv` key deletion.

## Targeted staging acceptance

1. As a TL, choose **one synthetic Agent** in the TL's assigned POD and move that Agent to a different POD *under the same organizational group*, with no recurring Day Off assignment to migrate. Confirm the Agent's new POD is visible on reload, with no duplicate identity and correct transfer history.
2. From a newly logged-in Agent session confirm the Agent has their own new POD, attendance/time punches and messaging remain functional. From a TL with a different POD, confirm no unauthorized transfer options.
3. As Admin, confirm employee roster and schedules remain intact. Test a multi-Agent transfer **only with synthetic data**; it still uses the older route.
4. Confirm the Unified Premium UI remains stable when switching tabs, while chat and QC Tracker sync work.
5. Monitor DevTools Network/Console (without copying session tokens). Scoped PATCH should return a redacted receipt; reject cross-team moves, stale roster base versions, and forged payload fields. Do not intentionally submit invalid mutations against real employees.

## Stop/rollback conditions

If a transfer changes the wrong POD, loses history, or shows unknown result: **do not retry immediately**. Reload Admin roster and reconcile the Agent's actual POD plus schedule. Re-deploy M2.9.63 staging Worker using the same verified staging-only config if this build fails, and repair any test records after reconciling authoritative state. Code rollback does not automatically reverse a successfully written transfer.

## Security remaining open

- `/api/workforce/roster/snapshot` still returns a full roster to authenticated workforce clients.
- Legacy employee `PUT` and multi-Agent/TL editing flows still use full-document submissions.
- Browser Firebase `/kv` root subscriptions remain and published staging rules allow authenticated reads.
- Five credential-pattern key names remain unclassified; do not delete based on names.

**Do not change Firebase `/kv` rules yet.** Next waves must migrate these direct reads and legacy writes, then validate Firebase rules in Emulator and live staging before restricting `/kv`.
