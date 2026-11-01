# Production POD 11 Google Sheets pilot — release HOLD (2026-10-18)

**Branch:** `feature/production-pod11-sheets-pilot-20261018`  
**Production Worker:** `oostrinotime` / `https://oos.trinotime.com/`  
**Source baseline:** GitHub `J-Celo/OOS` `main` (V2.0.5 snapshot). User confirmed this is their production repository. Exact current deployed **commit SHA parity is not yet proven**.  
**Status:** Owner explicitly approved the **read-only** release. PR is pending CI and merge; production deployment must be confirmed separately. Google writes remain hard-disabled in code.

## Deliberate pilot scope
- Only OOS `POD 11` and spreadsheet ID `12vO25JLIIIRTBo8tIJaHQzrJOZJz3V89g9MB9sfGrgo`.
- **Do not include** `Albertsons · POD 11`, POD 0–10, POD 12–16, ONBOARDING, TESCO, KROGER, or staging custom PODs.
- Sheet must remain private: owner plus `trinotime-sheets-production@trinotime-cloud.iam.gserviceaccount.com` as Editor. Never set "anyone with link".
- The Worker imports two pilot modules and adds `/api/workforce/store-exports/{pods,status,snapshot,sync-now}` routing. The existing Agent Metrics workspace now includes an authorized **POD 11 read-only five-tab viewer** and a separately authorized Google Sheet link. Neither enables synchronization.
- Reads use existing production server-verified workforce roles and `storeIntelReportServer`. Admin can target POD 11. Team Leader must have current verified POD 11 membership. Agent/other Teams denied. Queue/Dispatch fields remain empty until their production data source is separately migrated, rather than copying staging stores into production.
- The Google export is **one-way TrinoTime → private Google Sheets** and must never pull sheet edits back into TrinoTime.

## Approved first release: HARD READ-ONLY
- The `/api/workforce/store-exports/sync-now` endpoint **always returns a 409 hold error**, even if someone accidentally sets every production sync approval flag. No Google Sheets write is possible through that route in this release.
- The only approved production scope is the TrinoTime **read-only five-tab POD 11 viewer** and authorized private Google Sheet link. The Sheet itself stays private and requires separate Google permissions.
- To perform a future one-time controlled write, create a **separately tested and approved GitHub change** removing the hard hold. Do not toggle dashboard flags to bypass this gate.
- The existing Google exporter module remains dormant for review and later pilot work.

## Future-only write configuration (INACTIVE in this release)
All are required for any **manual sync**:
1. `DEPLOYMENT_ENV=production` (existing Worker production setting).
2. `TT_PRODUCTION_POD11_RELEASE_APPROVED=approved` (additional explicit server-only release gate; DO NOT SET YET).
3. `TT_GOOGLE_SHEETS_MANUAL_SYNC_ENABLED=approved` (server-only; DO NOT SET YET).
4. `TT_GOOGLE_SHEETS_CRON_ENABLED` is NOT `approved`; scheduled sync is not implemented/authorized.
5. The **POD 11-only destination ID is locked in audited pilot code**, so no production mapping secret is required to show the authorized Sheet link or to identify the pilot target. If an optional `TT_GOOGLE_SHEETS_POD_MAP_JSON` is present, it must validate to the exact same single POD/Sheet pair; all other maps fail closed.
6. `TT_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` secret is valid Google service-account JSON for **production service account only**. No staging private key, Google credential in repo, browser, logs, or ZIP. We have not generated/installed a production key.

The sync endpoint additionally requires the authenticated **Admin** role. Team Leaders can read their own report but **cannot initiate the first production write**. No webhook, scheduled cron or automatic data export is configured.

A URL to the private Google Sheet is disclosed only to server-authorized viewers. The single POD 11 document ID is built into this pilot and does **not** require a dashboard mapping change or manual-sync approval. Opening Google Sheets directly still requires Google-account permission; TrinoTime’s five-tab read-only viewer does not.

## Approval gates before any deployment or production write
- [ ] Verify actual deployed Worker source/version hash against GitHub branch baseline; prepare a rollback based on current Cloudflare deployment.
- [ ] Have authorized owner/team sign off on exporting workforce productivity data to this Google Sheet, including per-agent names, job IDs, access, retention, and sharing.
- [ ] Run `npm run production:pod11:sheets:qa`, `npm run check`, `npm run qa:sync`, and `npm run production:preflight` on a complete, verified source checkout (includes required Tracker fixtures).
- [ ] Verify every new endpoint and the five-tab Agent Metrics viewer with real (not simulated) Admin, POD 11 TL, other POD TL, and Agent sessions; verify same-name Albertsons Team separation and account switching.
- [ ] Review that Cloudflare Worker bindings, protected secrets, runtime values, routes, and Firebase isolation match current production; resolve any Wrangler warning **before** pressing Y.
- [ ] Deploy only after explicit production release approval. First verify `/pods`, `/status`, `/snapshot` with manual sync still **OFF**.
- [ ] Obtain separate sign-off for Google write; configure only the production service-account secret after the security review, then enable both explicit gates for one supervised manual sync. The POD 11 destination is locked by code; do not copy the staging map. Validate written cells against TrinoTime snapshot, no cross-team data, old rows cleared, no source metrics altered.
- [ ] Turn manual sync gate **OFF** again after pilot review. Keep Cron **OFF**.
- [ ] Do not widen to 17 PODs until quota, performance, mapping and retention are approved.

## Potential limitations to review
- The production V2.0.5 source has metrics but no matching RC2 Store Operations queue/dispatch writer yet; spreadsheet Queue tab will have headers but not staging-style queue entries.
- Report ledger is capped at 1000 jobs; truncation causes Google write rejection, not silent partial export.
- Rate limiting is local/in-memory; concurrent multi-Worker manual sync transactions need stronger distributed locking before enabling broader operations.
- The production service-account authentication route currently supports a JSON secret, not tested keyless workload identity. Do not create or paste a key just to proceed with code review.
- Production deployment from a newer candidate/staging ZIP remains forbidden.

## Release decision
**Code review only.** Do not merge this draft PR, deploy anything, enable server flags, or transfer data without explicit additional approval.

## Implementation update — 18 October 2026
- Added scoped five-tab in-app read-only viewer and separate Open Google Sheet link; no sync controls are available to TLs or Admins in this UI.
- Verified responsive CSS is scoped to this panel and table cells render as text.
- GitHub Actions [Read-only technical review #39138536926](https://github.com/J-Celo/OOS/actions/runs/39138536926) passed the complete offline checks before this documentation-only update. Live production testing is still pending.

## POD 11 Sheet link preparation update — 18 October 2026
- Read-only link is now available after authenticated authorization without adding Google mapping variables or enabling writes. Google account access remains controlled by private spreadsheet sharing.
- Tightened TL role check to require current, active `team_leader` roster membership assigned to exactly OOS POD 11.
- These changes do not authorize setting any production secret, flag, or enabling sync.
