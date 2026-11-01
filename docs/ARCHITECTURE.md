# TrinoTime architecture overview

```text
Employee / Team Leader / Administrator
     |
Cloudflare-hosted web UI
     |
Cloudflare Worker (API authentication, role and POD checks)
     +---- Firebase Realtime Database (workforce records)
     +---- Durable Object realtime chat (if configured)
     +---- R2 chat attachments (if configured)

Augmoto browser page
     |
Chrome QC Tracker observes relevant events
     |
Tracker background sync -> Worker shift/device/sequence checks
     |
Firebase -> authorized dashboards / exports
```

The Tracker observes Augmoto interactions for productivity metrics. This document does not certify that third-party operations are non-interfering; use only authorized workflows and test the integration separately.

## Code navigation

- `cloudflare/src/worker.js`: main API, authorization, attendance and shift authority, Tracker sync.
- `cloudflare/src/deployment-isolation.js`: staging resource checks.
- `cloudflare/public/index.html`: current web entry point.
- `cloudflare/public/assets/js/j-coverage-dashboard-rc20.js`: Coverage dashboard.
- `cloudflare/public/assets/js/j-agent-metrics-rc22.js`: Agent Metrics.
- `cloudflare/public/assets/js/j-report-exports-m2935.js`: Excel, PDF, and CSV exports.
- `cloudflare/scripts/tracker-sync-hardening-m2927-regression.mjs`: stale sequence and device conflict cases.
- `cloudflare/scripts/excel-chart-compat-m2952-regression.mjs`: workbook chart regression.
- `tracker/`: populated locally by reviewer helper from bundled checksum-verified ZIP.

## Environment boundaries

`cloudflare/wrangler.jsonc` refers to production resources. Use separate staging configuration and staging-only credentials for local interactive testing. Browser assets and Worker secret bindings may have different routes to external services; both must be checked.

This describes source structure, not independent end-to-end verification. The current Worker and some frontend modules are large and could be progressively modularized after baseline tests and security review.
