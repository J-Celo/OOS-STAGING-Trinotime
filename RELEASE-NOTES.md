# RC2 Staging UX18P46 — Current Release Notes (2026-11-01)

- Updated UX18P37 staging baseline to include TrinoTime UX18P38–UX18P46 app features without production configuration or historical roster changes.
- UX18P38–P40: 70-second default targets from October 28, retrospective read-only display of eligible ungraded locked shifts, preserved scorecards and custom targets.
- UX18P39–P42: verified QA membership protections, simplified Agent Metrics, active time in hours/minutes, Coverage/Confirmation render efficiency updates.
- UX18P43–P45: compact Attendance Log, fixed More tools overlay layering, protected hourly-rate Save/Cancel controls.
- UX18P46: read-only Admin Sync Guardian using server-acknowledged Coverage/Confirmation data; no browser-local pending visibility or production employee-data writes.
- Preserved staging Worker/Firebase/R2 isolation, production deploy guard, staging-only TrinoBot v1.0.8 pilot disabled by default and staged Tracker v2.2.62 (reviewed automatic Confirmation recovery port).
- No full-data migration, counter reset, role changes, Firebase writes or live deployments performed while packaging.
- Actual staging browser acceptance, synced agent counts and live Cloudflare bindings require validation after authorized staging deploy.

- **2026-11-01 Bio Break scroll hotfix:** resolved dialog jump during wheel/touchpad scrolling. Scoped CSS restores the modal centering transform when marked as the active scroller. Cache-busted only this stylesheet; no data, session, role, duration calculation or Tracker behavior changed.
