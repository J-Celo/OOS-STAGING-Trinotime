# M2.9.59 — Staging-only Firebase `/kv` exposure inventory

## Status and limitation

**The `/kv` vulnerability is NOT resolved by this release.** The published Firebase staging rule still grants `.read: "auth != null"` on the entire `/kv` node, including to authenticated Firebase sessions without a TrinoTime workforce role. Continue using the verified published M2.9.55 time-audit rules, and DO NOT change `/kv` or `/agentPresence` rules. The legacy browser still subscribes to `/kv` root and uses it during login/roster bootstrap.

Base: M2.9.58 Unified Premium Workspace confirmed working by owner in staging. M2.9.59 adds an optional **Admin-only, staging-only, read-only diagnostic** (no UI changes, no database writes, no secret migration).

## New endpoint

`GET /api/security/kv-exposure-summary`

- Requires an active Firebase Admin verified using existing `requireActiveAdminUser` before any privileged Firebase request. Anonymous, Agent, and TL callers cannot obtain the inventory; other methods have no route.
- Returns HTTP 404 when `DEPLOYMENT_ENV` is not `staging`, independently of request credentials.
- Uses Firebase Admin REST `GET /kv.json?shallow=true` with a bounded timeout and payload, so it asks for encoded **key names only**, not values.
- Returns only `totalKeys`, counts in broad categories (credential-pattern keys, attendance, roster, schedules, overtime, presence/coaching, configuration, unknown), a boolean indicating whether credential-looking key names remain, and a **cutover-blocked** notice. Never returns individual encoded/decoded key names, usernames, employee records, salts, credential hashes, or values.
- Category classifications are heuristic **based on key names only**; a count is not evidence that the corresponding key contains valid credentials. A zero count does not prove that `/kv` contains no sensitive values under other keys. The endpoint deliberately does NOT fetch/inspect values to determine that.
- Return response should not be posted publicly or logged to a third-party application. Do not share Firebase ID tokens, authorization headers, `.dev.vars`, or service accounts.

## How to validate in staging

1. Keep a copy of the working M2.9.58 staging Worker and the currently published **staging-only** rules; isolate changes to the staging Worker `oostrinotime-staging-qa` and verified staging Firebase `trinotime-staging-qa`.
2. Use the existing separate `wrangler.staging.jsonc`. The packaged `wrangler.jsonc` is **production reference only**. Run `cd cloudflare`, `npm.cmd run check`, `npm.cmd run qa:sync`, `npm.cmd run security:kv:inventory`, and `npm.cmd run staging:preflight`. Do not publish rules.
3. Deploy to the staging Worker only after reviewing configuration and tests. Confirm Agent, TL, Admin unified Premium UI, chat, attendance punches, cross-POD denials, and Tracker synchronization are unchanged.
4. Call the diagnostic as a verified Firebase Admin **only**, using a short-lived Firebase ID token supplied locally to the same staging origin as a Bearer token. Do not paste or share that token. Expect counts-only JSON; **do not export raw Firebase `/kv` records**.
5. Verify Agent, TL, unauthenticated calls receive a denial. Verify no `/kv` individual names or values appear in the response. Production route is not enabled by this release.
6. If credential-pattern keys remain, use the **existing Admin dry-run credential migration flow** to verify vault readiness and a backup/rollback plan. Do NOT press “Enable Vault-Only” based on the summary alone. Handle legacy credential cleanup as a separate authorized and tested step.

### Optional browser console verification (staging Admin only)

With an authorized Firebase Admin logged into the exact staging origin, inspect this snippet before running it in **that same browser**. It never prints your token; it logs **counts only**. Do not paste sensitive values into chat. If Firebase Auth isn't initialized in your session, this snippet will fail harmlessly and the alternative is to use a local API testing client.

```js
(async () => {
  const user = window.firebase?.auth?.().currentUser;
  if (!user || user.isAnonymous) throw new Error('Permanent staging Firebase Admin sign-in required');
  const token = await user.getIdToken();
  const response = await fetch('/api/security/kv-exposure-summary', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Inventory unavailable (HTTP ${response.status}): ${data?.error || data?.code || 'unauthorized'}`);
  console.log('TrinoTime staging KV exposure category counts:', data.categories);
  console.log('Total key count:', data.totalKeys, 'Credential-pattern keys detected:', data.credentialNamedKeysDetected);
})().catch(error => console.warn(error.message));
```

## Next milestone: the actual `/kv` cutover

- Build role- and POD-scoped projections for each remaining `/kv` data family; replace the browser root `child_added` / `child_changed` / `child_removed` / `value` listener and login roster bootstrap.
- Verify attendance, TL/Admin dashboards, chat, QC Tracker, offline recovery, cross-POD denial and legacy account access with staging data and Firebase Emulator.
- Only then propose `.read: false` for `/kv` and run rollback-tested staged deployment. The staging private data must remain protected during the migration, and no production deployment is authorized by M2.9.59.

## Offline QA coverage

`node scripts/kv-exposure-summary-m2959-regression.mjs` covers data minimization, access gating, production 404, a counts-only response, and rejection of a non-shallow response. Unit tests with mocked credentials are not a substitute for a real authenticated Worker call. Preserve M2.9.58 as rollback baseline; no Firebase Rules rollback is needed because this build does not modify rules.
