# Archive

Point-in-time records: implementation summaries, phase write-ups, test reports and
schema snapshots. **Nothing here is maintained.** Each file describes the codebase on
one date and several describe schema or files that no longer exist.

Use these for *why* a decision was made. For what is true today:

| Question | Read |
|--|--|
| Architecture, pitfalls, invariants | [`../../CLAUDE.md`](../../CLAUDE.md) |
| Tables, columns, RPCs, RLS | [`../DATABASE_SCHEMA.md`](../DATABASE_SCHEMA.md) |
| What ships and what does not | [`../STATUS.md`](../STATUS.md) |
| Everything else | [`../README.md`](../README.md) |

## Contents

| File | Snapshot of |
|--|--|
| [ACTUAL_SCHEMA.md](./ACTUAL_SCHEMA.md) | Live DB dump, 2026-02-08. Predates `entitlements` (`20260516150000`) |
| [ADMIN_DASHBOARD_IMPLEMENTATION.md](./ADMIN_DASHBOARD_IMPLEMENTATION.md) | Admin dashboard build, phases 1–2 |
| [ADMIN_DASHBOARD_PROGRESS.md](./ADMIN_DASHBOARD_PROGRESS.md) | Admin dashboard progress, 2026-02-14 |
| [CERTIFICATES_TESTING_REPORT.md](./CERTIFICATES_TESTING_REPORT.md) | Certificates E2E run, 2026-02-17 |
| [DATABASE_FIXES_APPLIED.md](./DATABASE_FIXES_APPLIED.md) | Migration batch, 2026-01-31 |
| [FEBRUARY_2026_IMPLEMENTATION_SUMMARY.md](./FEBRUARY_2026_IMPLEMENTATION_SUMMARY.md) | Multi-tenant transformation, Feb 2026 |
| [MANUAL_PAYMENT_COMPLETE.md](./MANUAL_PAYMENT_COMPLETE.md) | Manual-payment build-out. Current doc: [`../MANUAL_PAYMENT_SYSTEM.md`](../MANUAL_PAYMENT_SYSTEM.md) |
| [MULTI_TENANT_TESTING_REPORT.md](./MULTI_TENANT_TESTING_REPORT.md) | Multi-tenant manual test pass, 2026-02-17 |
| [PHASE_3_SUMMARY.md](./PHASE_3_SUMMARY.md) | Phase 3. Describes a `middleware.ts` that no longer exists — `proxy.ts` is the only middleware |
| [PHASE_5_SUMMARY.md](./PHASE_5_SUMMARY.md) | Phase 5, student dashboard |
| [PROJECT_COMPLETE.md](./PROJECT_COMPLETE.md) | "All phases complete", 2026-02-16 |
| [SCHEMA_FIXES_SUMMARY.md](./SCHEMA_FIXES_SUMMARY.md) | Column-name fixes + test data |
| [TESTING_JOURNEY.md](./TESTING_JOURNEY.md) | Narrative of the 2026-01-31 test push. Says `proxy.ts` was removed; it was not |
| [TESTING_STATUS.md](./TESTING_STATUS.md) | Pre-test configuration, 2026-02-17 |
| [TESTING_SUMMARY.md](./TESTING_SUMMARY.md) | Executive summary of the same push |
| [TEST_REPORT.md](./TEST_REPORT.md) | DB-fix validation run |

Live test documentation is [`../../tests/README.md`](../../tests/README.md); live smoke-test
output is [`../SMOKE_TEST_LOG.md`](../SMOKE_TEST_LOG.md), rewritten by
`tests/playwright/smoke-test.spec.ts` on every run.
