# M2.9.65 — QA Archive and Remaining Roster Security Surfaces (Staging)

## What changed

- All root-level legacy `M2956...M2964` QA records are **preserved** under `qa/history/<milestone>/` instead of crowding Windows Explorer.
- Current test output is written to `qa/current/`; reports are **not deleted**.
- Added `npm run security:roster:surface`, an offline synthetic security regression that verifies existing scoped read/patch permissions and **explicitly tracks open legacy access paths**.
- No runtime Worker/frontend, Tracker, CSS, rules, secret, or credential modifications. **Same deployed app bytes as M2.9.64**; M2.9.65 is an organization + QA guard release, not a functional security fix.

## Run offline QA

From `cloudflare/` with Node 22+ and normal installed development dependencies:

```powershell
npm.cmd run security:roster:surface
npm.cmd run check
npm.cmd run qa:sync
```

## Still NOT safe to lock down Firebase

The published staging `/kv` rule remains broadly readable to Firebase-authenticated clients, including potentially anonymous auth. The client has direct `/kv` root listeners and the authenticated Worker still exposes a full roster snapshot and legacy whole-document edits. These are explicit blockers to switching `/kv` `.read` to `false`. A passing M2.9.65 test is **not** proof that these are fixed.

## Next safe migration wave

Move a single additional roster screen to the authenticated scoped snapshot **only after** confirming which full-roster fields it needs. Next, eliminate legacy PUT usage and full-snapshot readback for scoped transfers with validated server-derived receipts, without allowing one team to inspect another. Test organization boundary CWH vs Albertsons, TL own POD, Agent self, Admin all; avoid changing production or live Firebase rules before compatibility checks.

## Safeguards

Use the already validated M2.9.64 staging Worker as rollback. Preserve the separate staging `wrangler.staging.jsonc`, do not use bundled production-reference `cloudflare/wrangler.jsonc`. Do not deploy this packaging-only build solely to reorganize files. Extract it to a **new empty Windows folder**; old logs in previously extracted folders will remain in place until manually archived. Do not overwrite or delete them without checking local customizations.
