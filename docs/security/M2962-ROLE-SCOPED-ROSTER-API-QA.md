# M2.9.62 — Role-scoped roster read API (Staging QA, Wave 1)

## Honest scope

This release **does not close the Firebase `/kv` vulnerability**. `/kv` still has a broad authenticated-read rule, the browser still subscribes to `/kv`, and the legacy `/api/workforce/roster/snapshot` still returns a full roster to verified workforce users because existing TL/Agent roster editing expects a complete document. Do not turn off `/kv` access, delete the five unknown credential-pattern keys, or change Vault-Only based on this patch. Those are separate migrations.

This wave introduces **a new server-side filtered read endpoint**, without changing existing readers or write contracts:

`GET /api/workforce/roster/scoped-snapshot`

Use the same authenticated X-TT-Security-Session or Firebase Authorization header supported by other workforce APIs. Do not paste either token in chat.

Role response contracts:
- **Admin:** complete canonical roster and its policy; `scope=all-pods`.
- **Team Leader:** their verified POD only; assigned TL and that POD's employee documents; no other PODs; `scope=own-pod`.
- **Agent:** their verified POD, their complete own employee entry, and minimal coworker names/POD/active role status; no other PODs or private coworker fields; `scope=own-pod-minimal-coworkers`.
- No active workforce identity or missing verified POD -> access denied or server error, never a global fallback.

The client cannot override its assigned POD by passing a URL query parameter. The route uses `requireWorkforceAttendanceActor` and a canonical `rosterResolvedStateServer` read.

## Staging QA (read only)

1. Retain M2.9.61 and your verified staging-only `wrangler.staging.jsonc` for rollback. Never use the packaged `wrangler.jsonc` (production-reference configuration).
2. Run `cd cloudflare` then `npm run check`, `npm run qa:sync` and `npm run security:roster:scoped` in Node 22+. The ZIP has no secrets, and the tests run offline.
3. Deploy **staging only** using the existing confirmed staging deployment workflow. No Firebase rule deployment or database operation is included.
4. Log in as a staging Agent and TL and verify normal roster edit, transfers, attendance, chat and Premium visual styling **remain unchanged**. The new endpoint is not yet used by the frontend, intentionally preventing regressions in existing full-document edit workflows.
5. To verify scoped-response privacy, inspect the new endpoint using a local authenticated browser session or a network inspector **without exposing tokens/identifiers/employee details**. Report only HTTP status and `scope` field. Never share full JSON response.
6. Re-test as Admin. Expect `all-pods`. For an unauthorized caller, expect an authorization failure.
7. Keep Firebase `/kv` rules as they are until all legacy browser subscriptions and full-document mutation flows have safe replacements.

## Next engineering step

Change roster mutations to accept authorized, *scoped* diffs instead of resubmitting the complete cross-POD document. Then switch existing Agent/TL frontend reads to this new scoped endpoint and make the legacy global snapshot Admin-only. In parallel, replace anonymous login's direct Firebase roster fetch, the broader `/kv` live listeners and generic storage reads. When the last client dependency is removed, use staged Firebase Rules Emulator tests and a controlled staging rules cutover to deny root `/kv` reads.

## Rollback

Use the previous verified M2.9.61 staging Worker build/configuration. The new endpoint is additive and has no database writes. Leave existing Firebase rules unchanged throughout this wave.
