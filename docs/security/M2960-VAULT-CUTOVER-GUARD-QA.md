# TrinoTime M2.9.60 — Credential Vault Cutover Guard (Staging QA)

## Scope / why this patch exists

The owner ran a **staging-only** Admin `/api/security/kv-exposure-summary` test in M2.9.59, which counted **54 `/kv` keys**, including **5 key names matching credential-risk patterns**. This is a *key-name heuristic*, **not** proof that five credentials or passwords exist, and not a confirmed incident.

Firebase `/kv` remains readable to `auth != null`, which can include anonymous Firebase sessions. This release DOES NOT remedy that exposure, change Firebase rules, remove the root listener, or delete database values. Do NOT mark the site secure until the live reads are migrated, approved, and tested.

M2.9.60 hardens the **existing** Admin-only `POST /api/security/credential/migrate` workflow. It never runs a migration autonomously.

## Source changes

- Adds `src/credential-cutover-guard.js`: strict roster count reconciliation, privacy-safe credential-pattern key-name aggregation, and explicit block reasons.
- The Worker rejects **Enable Vault-Only** when there are (1) no active Agent/TL roster records, (2) any active account missing credentials in both places, (3) malformed credential records, (4) unprepared legacy records, or (5) unreviewed credential-pattern `/kv` key names outside known `agentauth:` / `tlauth:` namespaces. The existing Admin verification and destructive-action confirmation stay mandatory.
- The Admin modal shows safe, count-only blockers *before* enabling a destructive cutover; the Worker independently re-checks authorization and state immediately before its atomic Firebase patch.
- The dry-run returns aggregate `cutoverReady` / `cutoverBlockers` and `summary.unreviewedCredentialRisk`; candidate-person samples are removed from this response.
- No changes to JWT authentication, frontend role permissions, Agent/TL/Admin dashboards, Premium appearance, attendance, chat, schedules, or Tracker package.

## Offline verification

From `cloudflare`, run:

```sh
node scripts/credential-cutover-guard-m2960-regression.mjs
npm run check
npm run qa:sync
```

The focused suite uses synthetic fake identities/records; **no Firebase or Cloudflare requests**.

## Safe staging QA after deploying M2.9.60

1. Keep a copy of working **M2.9.59** and preserve staging-only Wrangler config/secrets; the included `cloudflare/wrangler.jsonc` is **production reference**, NOT for staging deployment.
2. Confirm regular Agent and TL login, attendance, chat/messaging, and unified Premium appearance.
3. With staging Admin, open the existing Secure Credential Vault panel. `Prepare Vault` performs an Admin authorized preview first. **Do not confirm the operation yet.** Note *counts only*: candidates, already secure, missing, invalid, unreviewed credential-risk key count.
4. Only after separately verifying every roster account's vault sign-in, ensuring backup/rollback, and reviewing remaining credential-risk key classes should an authorized Admin consider `Enable Vault-Only` in a maintenance window. Existing Client `/kv` reads remain open even after this action.
5. The five flagged key names from M2.9.59 are not yet identified or confirmed sensitive. A privacy-safe readiness guard may block cutover even when those are merely labels; review should be done without copying secrets into chat.

## Rollback / blockers

If live staging behavior regresses, revert the **Worker/frontend package** to working M2.9.59 using known-good staging config. Never roll back Firebase Rules by guessing: use the actual staging rules backup. This patch made no Firebase data/rules changes, so no database rollback should be needed from the code package alone.

**DO NOT auto-delete keys, enable vault-only, replace rules `/kv` with `.read:false`, deploy to `oos.trinotime.com`, or share credentials.** Offline tests are NOT live staging verification. The `/kv` exposure requires a later, distinct root-listener and bootstrap-data migration.
