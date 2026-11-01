# TrinoTime M2.9.61 — Legacy Credential Cleanup Readiness (STAGING QA)

## Scope and confirmed observations

User's staging Admin M2.9.59 diagnostic counted **54 `/kv` keys, 5 names matching credential patterns**. User subsequently showed **Vault-Only active**, seven approved identity bindings, and confirmed fresh logins for TEST MOVE (Agent) and Sung Jinwoo (Team Leader). These facts do **not** establish that all seven credential states were independently verified, or that the five flagged keys contain passwords or can be deleted.

This release adds a **READ-ONLY, counts-only, staging-Admin API** to classify the five flagged *names*, and compare recognizable old Agent/TL key names with the **current resolved roster**. No credential values, names, password hashes, salts, UIDs or original `/kv` encoded key strings ever appear in the API result.

**The root `/kv` security weakness is NOT fixed.** Firebase `/kv` `.read: "auth != null"` remains. Existing browser listeners and login/bootstrap dependencies still need staged migration. Do not change Firebase rules based on this release.

## New route (GET only)

`/api/security/credential/legacy-cleanup-readiness`

- Runtime guard: `DEPLOYMENT_ENV` must equal `staging`; production returns 404.
- Verifies active Firebase Admin via `requireActiveAdminUser` before any privileged reads and rate-limits requests.
- Calls the existing size/time-limited Firebase REST **`GET /kv.json?shallow=true`** for encoded *key names only*, resolves Agent/TL roster read-only via `rosterResolvedStateServer`, and reads the vault policy's `mode`.
- Aggregates: `credentialPatternKeys`, `recognizedActiveLegacy`, `recognizedUnmatchedLegacy`, `recognizedAgentLegacy`, `recognizedTeamLeaderLegacy`, `otherCredentialPatterns`, `invalidEncodedNames`, `activeRosterCredentialSlots`, and `vaultOnlyReported`.
- **`recognizedUnmatchedLegacy` is NOT evidence that records are safe to delete**. A former name, renamed user, obsolete backup or inconsistent roster can still require retention/rollback review.
- `otherCredentialPatterns` may be false-positive names; it is not proof their values contain credentials.
- Explicitly returns `deletionAuthorized:false` and `rulesCutoverReady:false`. **No write endpoints or deletion features are introduced.**

## Staging QA (after separately reviewing and deploying)

1. Back up the known-good M2.9.60 Worker ZIP and the existing Firebase staging rules. Retain the staging-only Wrangler configuration and secrets privately (not included here). `cloudflare/wrangler.jsonc` remains a *production reference*; NEVER use it to deploy staging.
2. From `cloudflare`, run `npm.cmd run check`, `npm.cmd run qa:sync`, `npm.cmd run security:credential:cleanup-readiness`, and `npm.cmd run staging:preflight` on Windows. Do not publish Firebase rules.
3. Deploy **only** the staging Worker using the known-good `wrangler.staging.jsonc`, after verifying the worker name, Firebase project, RTDB URL, and bindings. No production deployment authorized.
4. Confirm Agent/TL/Admin login, Premium visual layout, attendance punches, chat/messaging, Tracker sync, and cross-POD access denial.
5. In the *staging origin* browser Console, while signed in as a verified Firebase Admin, optionally run this reviewed snippet. No token is printed; only high-level counts are logged. **Do not send auth headers or full console screenshots with tokens.**

```js
(async()=>{
  const user=window.firebase?.auth?.().currentUser;
  if(!user || user.isAnonymous) throw Error('Staging Firebase Admin sign-in required');
  const token=await user.getIdToken();
  const response=await fetch('/api/security/credential/legacy-cleanup-readiness',{
    method:'GET',cache:'no-store',headers:{Authorization:`Bearer ${token}`}
  });
  if(!response.ok) throw Error('Staging cleanup readiness unavailable (HTTP '+response.status+')');
  const data=await response.json();
  console.log('Credential key-name counts:',{
    pattern:data.credentialPatternKeys,
    activeLegacy:data.recognizedActiveLegacy,
    notMatchedToCurrentRoster:data.recognizedUnmatchedLegacy,
    otherPatterns:data.otherCredentialPatterns,
    invalidNames:data.invalidEncodedNames,
    vaultOnlyReported:data.vaultOnlyReported,
    deletionAuthorized:data.deletionAuthorized
  });
})().catch(e=>console.warn(e.message));
```

6. Share **only these aggregate counts** back for prioritization. Do not send raw key names, account names, password hashes, passwords, JWTs, screenshots with PII, or exported Firebase data.
7. If counts indicate records need cleanup, plan a separate **explicitly approved** migration: confirm true data types/necessity via server-side verified checks, take a timestamped staging backup and test restore, verify every active account and historical retention requirement, prepare narrow per-key changes with a dry-run and staged rollback, then test all workflows. **No deletion should happen automatically.**

## Rollback and limitations

To roll back an M2.9.61 Worker deployment, redeploy the known-good M2.9.60 staging Worker using the verified staging-only configuration. This release changes **no** Firebase data or rules, so there is no data rollback from this patch.

The key classifier is **heuristic and metadata-only**. A zero result does not prove all `/kv` values are safe or the overall database is secure. The next *actual exposure fix* requires replacing frontend root subscriptions and legacy roster/bootstrap reads with authenticated, role/POD-scoped APIs before `/kv` can be closed in Rules.
