# M2.9.56 — Phase 2A: Firebase /kv exposure and migration readiness

**Classification: INCOMPLETE FIX / DO NOT PUBLISH NEW KV RULES YET.**

This package is derived from the user-supplied M2.9.55 corrected staging package. It adds **offline inventory/QA tooling only**. It does **not** update the public website, Worker runtime, Tracker, Firebase configuration, or the published Firebase rules. Existing UI and runtime files are unchanged by this milestone.

## Confirmed from code and supplied rules

- Staging Realtime Database rules allow `.read: "auth != null"` on the **entire** `/kv` subtree. This condition does not distinguish admin, TL, agent, assigned POD, Chemist Warehouse vs Albertsons, or anonymous Firebase accounts.
- Browser JavaScript still makes direct key and root references to Firebase `/kv`; it listens to `child_added`, `child_changed`, `child_removed`, and `value` on the entire root. It also uses several direct one-time reads for compatibility and history.
- The Worker has credential-vault migration code, with server-only `secureCredentials` storage and opt-in `vault-only` cutover; approved identity bindings **alone** do not prove vault cutover readiness.
- `/agentPresence` still has broad authenticated read access and will require a separate access migration.
- Staging owner already published `/serverTimeAudit` read/write denial and independently verified denied `get` and `set` simulations in Firebase Rules Playground. Agent and TL dashboards were reported functioning afterwards.

## High-priority migration sequence

1. **Preserve state.** Back up the actual currently published staging rules and exported staging data in a protected local location. Do not place employee data or credentials in source control or the chat.
2. **Validate vault readiness.** Use the existing Admin **Prepare Vault** dry-run preview to identify candidate counts, invalid legacy records and missing credentials; DO NOT enable Vault-Only until all intended login paths are tested. 7/7 approved identities is not equivalent to all valid credentials migrated.
3. **Inventory sensitive /kv key families.** Use code-path analysis and optional locally generated **key names only** list. The offline tool in this package reports category counts and does not print identities, keys, or values. It never connects to Firebase.
4. **Move reads behind authorization.** Design narrowly scoped Worker APIs that verify the current Firebase identity and server-side Agent/TL/Admin/POD authorization. The auth boundary must use the actual nested organization hierarchy: Chemist Warehouse or Albertsons -> POD/team -> employee. Do not trust client-supplied POD, employee ID, or role.
5. **Replace realtime subscriptions** with authenticated scoped updates or authorized refresh endpoints. Include stale session revocation, cache invalidation, offline reconnect, Tracker, payroll/attendance and schedule regression coverage.
6. **Only after migration**, test a `"kv": {".read":false,".write":false}` proposal in the Firebase Emulator against every feature. Publish staging rules in a scheduled test window, monitor browser errors and Worker logs, then consider a separate approved production change.

## Run tests (inside `cloudflare`)

`npm.cmd run security:kv:phase2` on Windows; `npm run security:kv:phase2` on macOS/Linux.

For an optional key-name-only inventory, create a **local** JSON array of Firebase `/kv` direct-child key names, e.g. `["ZXhhbXBsZQ", "ZW1wbG95ZWVz"]` (artificial examples only), then run:

`node scripts/kv-phase2-key-inventory-m2956.mjs --local-keys-json LOCAL-KEYS-ONLY.json`

It **rejects a normal database object/export**; do not give it your full staging database export. Do not upload local key lists, hashes, UIDs, passwords, Firebase service-account JSON or employee data to ChatGPT.

## Safe interactive verification, no sensitive data collected

In Firebase **staging** Rules Playground: simulate authenticated `get` of `/kv` using a staging Agent UID. Current rules are expected to ALLOW it, which is the vulnerability. **Do not actually query/download `/kv` contents.** This is a permission simulation only.

## Deployment / rollback

M2.9.56 Phase 2A contains tests and docs only, so there is **nothing to deploy to the Worker**. Do not republish Firebase rules. The prior M2.9.55 corrected package is unchanged as the running baseline. If the offline audit script produces unexpected counts, retain M2.9.55 and investigate; do not attempt a broad rules cutover.

**Do not mistake this report for completion of Phase 2.** A full `/kv` migration and security tests are required before any deny-read rule is safe.
