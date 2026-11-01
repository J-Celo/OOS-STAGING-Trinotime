# Security review checklist — status and limitations

This file documents review observations; it is **not** a security certification.

## High-priority verification

- **Firebase rules:** `firebase-rtdb-rules-v1_1_70-stage-a-migration.json` is a historical migration artifact. Several paths in it grant broad read/write access to authenticated users, including `kv`, `serverTimeAudit`, and `agentPresence`. Inspect current deployed rules in Firebase Console before asserting an exposure. Do not copy historical rules into production.
- **Secret history:** Current visible source file names do not establish whether credentials were previously committed. Review Git history and GitHub secret-scanning alerts. Rotate any accidentally exposed service-account keys or secrets.
- **Hardcoded identities:** Review server-side and client-side role-specific exceptions, and verify they cannot confer unauthorized access.
- **Staging isolation:** Ensure dedicated Firebase credentials and databases are used for staging/local preview; check client-side URLs, Worker environment, R2 bindings, and Durable Objects separately.
- **Third-party interaction:** Use the QC Tracker only on authorized Augmoto workflows and validate that it does not cause unintended task submissions or data mutations.
- **Data sharing:** Use synthetic users and sample reports, not employee records, in portfolio demonstrations.

## Good patterns observable in source

- Deployment-isolation helper for staging.
- Shift/device/sequence checks in Tracker regression code.
- Versioned test scripts and production deployment preflight.

These are useful signals but are not proof all access control is safe.

## Reviewer process

Do not deploy any source. Do not change Firebase rules or production database contents as part of this review. Record findings with precise paths, conditions, and reproduction steps; separate confirmed vulnerabilities from hypotheses.

## 2026-10-09 local pre-review scan — interpretation

The project owner ran Gitleaks against locally available Git refs with redaction enabled. The local output reported **325 scanned commits** and **248 detections**: 192 `generic-api-key` and 56 `gcp-api-key`. These totals count findings in historical code, not necessarily distinct secrets. The 192 generic findings were associated with credential-epoch variable names, a Firebase App Check *site-key identifier*, an employee-ID constant, and a release-metadata field. Those are **likely false positives**, but this categorization does not prove the absence of other sensitive data.

Google/Firebase web API keys can appear legitimately in browser bundles. The owner inspected one production browser key with website/referrer restrictions and a restricted set of APIs. **Not every historical `gcp-api-key` detection has been individually matched to that current key.** Do not label the entire repository or Git history "cleared" by this review.

Review history for employee-identifying records and actual server-side service-account credentials before granting additional source access. Never publish scan report contents or commit credentials, and do not rotate or change live Firebase keys/rules based solely on pattern matches without testing their production use.
