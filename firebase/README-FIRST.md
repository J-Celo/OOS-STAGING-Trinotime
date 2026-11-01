# TrinoTime M2.9.55 — Staging Realtime Database Rules Patch (2026-10-10)

**Status:** Prepared and offline-tested; **NOT deployed or published**. **Do not apply to production.**

## What this actually changes

Only the **`/serverTimeAudit`** Firebase Realtime Database Security Rules branch:

```json
"serverTimeAudit": {
  ".read": false,
  ".write": false
}
```

This removes the existing `$eventId` child rule that permits direct Firebase client writes. Firebase's descendant grant semantics mean setting a parent `.write: false` without removing the permissive child is not sufficient.

Your **2026-10-10 owner-supplied staging rules snapshot** already denies all client writes to `/auditEvents`, so **do not overwrite it with the older M2.9.55 example**. The older bundled example also contains different rules for premium entitlements; applying the old full file would risk changing security protections unrelated to this fix. `/auditEvents` stays admin-only for direct reads, exactly as you shared.

`/kv` and `/agentPresence` remain broadly readable by any Firebase-authenticated identity including anonymous auth. These are **not fixed yet**; changing them requires a client/Worker migration.

## Contents

- `STAGING-RULES-USER-SUPPLIED-BACKUP.json`: exact rules you pasted in ChatGPT, **not** an independently exported current published ruleset.
- `STAGING-RULES-PROPOSED-M2955-ONLY-TIME-AUDIT.json`: your supplied rules with **only** `serverTimeAudit` altered.
- `prepare-staging-rules.mjs`: **preferred tool** for producing a patch from the actual, latest staging rules you export locally; never writes to Firebase.
- `test-staging-rules.mjs`: offline invariants and negative test cases, not a Firebase emulator or live end-to-end test.

## Step 1 — Confirm the correct Worker code is live on staging

First deploy the **M2.9.55** Worker and frontend to **staging** using your previously verified `cloudflare/wrangler.staging.jsonc` and staging-only secrets. Do **not** use the bundled `cloudflare/wrangler.jsonc`: it is a production reference.

If you haven't deployed M2.9.55 yet, **stop here**. Earlier clients may write directly to `serverTimeAudit` and would fail once access is denied.

After deployment, check the staging Worker has authenticated `/api/workforce/audit/time` GET/POST paths and that the browser uses those rather than Firebase client operations. Test Agent punch, TL punch, Admin audit, premium view, and network/console errors. The app's visible VERSION 2.0.3 is not a deployment identifier.

## Step 2 — Backup actual published STAGING rules

In Firebase Console, select **`trinotime-staging-qa`** (not `cwh-timeclock`) → Realtime Database → Rules. **Copy ALL current JSON rules** into `current-staging-rules-YYYYMMDD.json` on your private computer. Do not save credentials or employee data in that file; rules contain the authorization policy only.

Avoid using this provided backup file instead of a fresh Firebase export if the console has changed since your pasted snapshot.

## Step 3 — Create a surgical candidate from that live export

From this package directory:

```powershell
node .\prepare-staging-rules.mjs .\current-staging-rules-YYYYMMDD.json .\candidate-staging-rules.json
node .\test-staging-rules.mjs
```

The tool refuses snapshots without expected current staging tree markers, refuses broad-root permissions, refuses a permissive audit root or premium write, and refuses overwriting existing files. It modifies only `serverTimeAudit`; it neither contacts Firebase nor publishes anything. It cannot independently prove which Firebase project a file came from—**verify the selected project in the console**.

## Step 4 — Test before publishing

Use Firebase Rules Playground or the Realtime Database Emulator with realistic **staging-only** identities and data. Verify:

- Anonymous and ordinary Firebase-authenticated clients **cannot** read `/serverTimeAudit` or create `/serverTimeAudit/test-event`.
- Agent and Team Leader continue normal `POST /api/workforce/audit/time` actions **through the authenticated Worker**.
- Agent cannot submit TL-only diagnostics, spoof identities, list another Agent's diagnostic records, or write audit events directly.
- Admin can retrieve the appropriate audit records using authorized paths.
- Your existing schedule, roster, chat presence, attendance, Tracker and Excel reporting flows still work.

**DO NOT publish based only on the included Node tests**; they are offline static/mocked checks and cannot substitute for emulator or staging browser testing.

## Step 5 — Publish only on staging, then re-test

After confirming M2.9.55 is deployed and completing the above tests, paste **`candidate-staging-rules.json`** into the Rules tab of the `trinotime-staging-qa` project; inspect diff and press Publish only for that staging database. Verify immediate post-publish behavior and logs.

## Rollback

If any valid staging action breaks, restore the **fresh, actual staging rules backup from Step 2**, and if needed return to the prior known-working staging Worker. Do not restore the older M2.9.55 demo file or a production rules snapshot.

No existing data is deleted by this rules change. Changes to production require a separate review and approval.

## Known unresolved issues

- `/kv` broad `auth != null` read (especially anonymous authenticated Firebase clients).
- `/agentPresence` broad read.
- One readable premium entitlement. Premium-identity logic still includes hardcoded names, but *client writes are already denied in the supplied staging rules*.
- Other unverified Worker API role boundaries and historical credential review.
- Worker GET time diagnostics currently reads the entire root then filters in memory; should be optimized before high volume.
