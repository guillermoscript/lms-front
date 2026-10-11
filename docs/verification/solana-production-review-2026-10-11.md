# Shared subscription cancellation / Solana review — 2026-10-11

**Verdict: ready for code review; not yet approved for production release.** Final code passes the checks below. Local PostgreSQL access transitions and concurrency, authenticated canceled billing on desktop/mobile, and API rejection checks now have fresh evidence. New Devnet payments, wallet signing, actual paid-boundary expiry, and signed Stripe/PayPal sandbox events still need live verification. Mainnet validation remains deferred.

## Shared architecture

Inspected `IPaymentProvider`, `ProviderCapabilities`, `CancellationResult`, the shared webhook dispatcher, student/admin actions, expiry jobs and entitlement triggers. Provider adapters stop billing; scheduling cancellation preserves verified paid access until its deadline. Provider billing finality (`CancellationResult.mode=immediate`, e.g. PayPal) is distinct from explicit application immediate termination/refund.

- Student/admin actions, normalized cancellation webhooks and Solana wallet cancellation verification use `applySubscriptionCancellation` / `apply_subscription_cancellation`. Locked transitions preserve paid access, handle duplicate cancellation and refuse to reopen terminal subscriptions.
- Native adapters cannot silently omit cancellation/reactivation or report a no-op as confirmed billing cancellation. Manual adapters may omit remote operations. Final cancellation cannot resume. Provider failures remain visible; repeated student cancellation retries remote cancellation rather than hiding an earlier failure.
- Shared `apply_paid_subscription_period` serves webhook renewal/activation and Solana receipt persistence. It retains the cancellation schedule, respects the verified provider deadline, prevents older period writes from shrinking newer paid access, and refuses terminal access restoration. Existing durable webhook effects and per-period receipt uniqueness remain intact.
- Shared locked expiry rechecks the current deadline. Scheduled cancellation is expired across providers; unscheduled expiry remains capability-gated. Entitlement updates target subscription grants only. Independent product access remains intact.
- Solana keeps provider-specific subscriber signing, on-chain verification, exact receipt reconciliation, atomic transfer protections and charge limits. Reconciliation-only recovery cannot initiate a debit. Ownership, host-resolved tenant and same-origin guards remain in place.
- Billing distinguishes scheduled cancellation from ended access, retains the paid deadline, and provides **Check payment** for unresolved confirmation/persistence. The live screenshot check found and corrected a stale “Active subscription” heading and continued-access promise on terminal records. English/Spanish copy now distinguishes those states.

## Fresh verification results

| Check | Result | Evidence type |
| --- | --- | --- |
| Unit regressions | **133 passed, nine files** | Mocked provider/database/RPC dependencies |
| Targeted ESLint | **Passed, zero errors/warnings** | Static checks, final UI/test changes included |
| Strict TypeScript | **Passed**, 6 GB scoped check | Changed files and imported dependencies; not repository-wide |
| Production build | **Passed** | Local `npm run build`; type validation is explicitly skipped by existing configuration |
| Shared SQL contract | **Passed**, transaction rolled back | Real local PostgreSQL, synthetic isolated fixtures/receipts/deadlines |
| Concurrent lifecycle operations | **Passed**, two PostgreSQL sessions | Real row-lock contention; synthetic paid periods, no provider payment |
| Component browser regressions | **7 passed**, desktop/mobile | Actual components/CSS/translations, prepared props and mocked APIs |
| Authenticated canceled billing | **Passed**, desktop 1440×1000/mobile 390×844 | Real local production build and existing local subscription 10002 |
| API malicious request rejection | **12 passed**, three endpoints | Real local HTTP, authenticated test accounts; no payments |
| Devnet canceled delegation | **Read confirmed** | Live read-only public RPC; no new transfer or signature |
| Whitespace check | **Passed** | `git diff --check` |

### Local database

Docker and local Supabase recovered without a restart. Before reuse, subscription **10002** was inspected and remained `canceled`, `cancel_at_period_end=false`, paid deadline **19:38:45 UTC / 3:38:45 PM Caracas**. It was not reactivated, reset or rewritten. Its legacy prematurely expired entitlement remains unchanged; the patch intentionally does not reopen terminal historical records.

Both task migrations were applied directly via `docker exec ... psql -v ON_ERROR_STOP=1` to **local** Supabase only. This verified their SQL/schema behavior; the Supabase migration-history ledger was not repaired or stamped. Migration deployment through the normal workflow remains a release step.

The [SQL contract](../../tests/sql/subscription-cancellation-contract.sql) passed for Stripe, Solana delegation cancellation and final-at-provider PayPal cancellation: exclusive subscription access survives scheduling, duplicate/out-of-order events do not revoke paid access, simulated deadline expiry invokes entitlement expiry, delayed synthetic receipts retain cancellation while repairing valid access, terminal access is not restored, independent product grants/access remain intact, and privileged functions reject authenticated direct execution. Two fixture setup errors were corrected during this run: Solana-only plan hours on non-Solana clones, and reuse of one synthetic signature for different receipts. Both failed attempts rolled back.

A separate [concurrency script](../evidence/solana-production-review-2026-10-11/reverification/database-concurrency.py) ran two real PostgreSQL sessions. The second session waited on the first session's subscription lock. Both cancel-first/renew-first orders preserve the updated paid deadline and cancellation flag; stale expiry waits for renewal and returns false; immediate termination winning the lock prevents a late paid write from restoring access. Its labeled fixture IDs were removed. A final query found **zero** remaining isolated subscriptions (210011–210013, 219091). These tests use synthetic periods and receipts, not real settled provider payments or elapsed wall-clock billing periods.

[Migration logs](../evidence/solana-production-review-2026-10-11/reverification/local-cancellation-migration.log), [renewal migration](../evidence/solana-production-review-2026-10-11/reverification/local-renewal-migration.log), [SQL result](../evidence/solana-production-review-2026-10-11/reverification/database-contract.log), [concurrency result](../evidence/solana-production-review-2026-10-11/reverification/database-concurrency.log).

### Live UI/API and read-only Devnet

The final local production build was served on an isolated loopback port (3018). The student test account's existing canceled subscription appears with **Ended subscription**, **Canceled**, the historical paid deadline, and accurate ended-access copy. Desktop/mobile screenshots have no horizontal overflow; controls do not offer renewal on the ended record. Screenshots were visually inspected. No database state was prepared for these captures.

For each of `cancel-tx`, `cancel-verify`, and `retry-renewal`, live checks rejected: foreign origin (**403**), another tenant hostname (**404**), another tenant hostname with a forged original-tenant header (**404**), and a different authenticated owner (**404**). This checks rejection paths, not a fresh successful wallet cancellation/recovery transaction. The [live script and results](../evidence/solana-production-review-2026-10-11/reverification/live-ui-api.json) document all 12 responses. An initial combined run hit the shared payment limiter (429) on its sixth authenticated request; the final run orders the lower-limit retry checks first and stays within the configured limits. That rejected run is retained separately, and was not treated as proof of tenant rejection.

- [Desktop live canceled billing](../qa/solana-production-review-2026-10-11/desktop-live-canceled-billing.png)
- [Mobile live canceled billing](../qa/solana-production-review-2026-10-11/mobile-live-canceled-billing.png)
- [Desktop prepared confirmation uncertainty](../qa/solana-production-review-2026-10-11/desktop-uncertain-component.png)
- [Mobile prepared confirmation uncertainty](../qa/solana-production-review-2026-10-11/mobile-uncertain-component.png)

At **19:27:34 UTC / 3:27:34 PM Caracas**, a [fresh read-only Devnet query](../evidence/solana-production-review-2026-10-11/reverification/devnet-readonly.json) confirmed subscription 10002's delegation remains canceled (`expiresAtTs=1791747525`, period start `1791743925`, amount pulled `10000`, hourly period). No signer/private key was loaded and no payment was submitted.

The seven component checks use prepared 2030 deadlines and mocked endpoints. They verify desktop/mobile canceled and ended copy, safe repeated recovery-only requests, transport uncertainty switching to **Check payment**, and overflow. These are separate from the live authenticated screenshots and do not prove confirmation/persistence recovery on Devnet.

### Static and mocked evidence

The 133 unit tests cover shared cancellation/result semantics, missing native adapter methods, final cancellation resume rejection, shared webhook/refund behavior, ownership/tenant/origin guards, uncertain confirmation, failed receipt writes, reconciliation without another debit, invalid receipts, and cancellation interleavings in renewal. They verify application decisions and RPC calls; real settlement remains separate.

Strict command: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tests/tsconfig.subscription-review.json`. This passed independently of the build. Repository-wide standalone checking was not retried because the previous 8 GB run exhausted memory. A stalled sandbox build was stopped and rerun with normal local access; the final build passed after the ended-copy fix.

[Unit log](../evidence/solana-production-review-2026-10-11/reverification/unit-tests.log), [strict TypeScript log](../evidence/solana-production-review-2026-10-11/reverification/strict-typescript.log), [targeted lint](../evidence/solana-production-review-2026-10-11/reverification/targeted-lint.log), [final UI lint](../evidence/solana-production-review-2026-10-11/reverification/final-ui-lint.log), [build log](../evidence/solana-production-review-2026-10-11/reverification/production-build.log), [component browser log](../evidence/solana-production-review-2026-10-11/reverification/component-browser-tests.log).

## Remaining release checks

1. New isolated Devnet subscriptions: successful wallet signing/cancellation, actual paid-boundary access expiry, concurrent cron/student charge attempts, both on-chain cancellation/renewal race orders, and exact balance/receipt assertions. Keep historical subscription 10002 canceled.
2. Confirmed-transfer/failed-receipt-write and confirmation uncertainty through the final live API, proving recovery persists one receipt without a second debit. Current fresh evidence is mocked; earlier live settlement in the [resilience report](solana-subscription-resilience-2026-10-11.md) predates this change.
3. Signed Stripe/PayPal sandbox cancellation and duplicate/out-of-order renewal/terminal events. Shared mocks and local SQL cover access rules, not provider verification/sign-off.
4. Migration-history integration, scheduled job operation and repository-wide type safety. Full authenticated pending-payment UI and wallet-extension recovery are unverified; prepared component screenshots cover those states. No live flow recording was captured.

No mainnet, real funds, deployment, commits, pushes, Docker restart or secret exposure. Unrelated workspace changes were preserved. Historical initial-pass evidence remains in the parent evidence folder; `reverification/` contains this final pass.

## Follow-up: pending state after insufficient funds and automatic scheduling

**Both reported code gaps are fixed; deployment/runtime scheduler sign-off remains outstanding.**

- Billing gives a durable `renewal_pending` marker priority over `renewal_error=insufficient_funds`, including after reload and when stale metadata contains both. The funded-attempt transition clears the previous balance error atomically before submission. A confirmation or receipt-write failure leaves the pending marker intact, so **Check payment** remains the safe recovery action. The component also suppresses an old local insufficient-funds message when refreshed props indicate an unresolved attempt.
- New migration: `20261011194500_renewal_pending_supersedes_balance_error.sql`. Applied to local Supabase only; authenticated clients still cannot execute the payment-attempt writer. No paid-access/provider cancellation contract changes.
- `vercel.json` now schedules `/api/cron/solana-pull` once every ten minutes, matching the existing reconciliation cadence. Cron authentication/configuration guards remain intact, and scheduled execution uses the same renewal/reconciliation function as student retries. Unconfigured rails skip execution. No hosted cron, cloud deployment, mainnet or live debit was triggered by this task. Deployed scheduling still depends on the project's cron support and configured secrets/wallets; its operation has not been observed.

Follow-up checks: **138 mocked unit tests across ten files passed**, including five scheduler/route tests; targeted lint and the scoped strict TypeScript check passed; production build passed independently of the strict check. The seven existing prepared component browser tests passed again. The rollback-only SQL contract passed with a new assertion that a funded attempt removes the previous balance error while retaining the pending marker.

The full authenticated production page also passed an additional **desktop and mobile regression**. This used isolated **manually prepared database state** and **mocked retry responses**, not a funded Devnet wallet. The fixture first showed insufficient funds and a Retry button. The real local attempt RPC then persisted pending state; the test deliberately reintroduced the stale error alongside pending to represent legacy/out-of-order metadata. After reload the page showed unresolved confirmation, omitted the insufficient-funds warning/Retry button, and **Check payment** submitted `recoveryOnly=true`. Fixture subscription 219092 and its plan were removed; historical subscription 10002 stayed canceled. Screenshots were visually inspected.

- [Desktop prepared pending regression](../qa/solana-production-review-2026-10-11/desktop-prepared-pending-after-insufficient.png)
- [Mobile prepared pending regression](../qa/solana-production-review-2026-10-11/mobile-prepared-pending-after-insufficient.png)
- [Exact prepared-page results](../evidence/solana-production-review-2026-10-11/pending-and-scheduler/prepared-page-regression.json)
- [SQL regression](../evidence/solana-production-review-2026-10-11/pending-and-scheduler/database-contract.log)
- [Mocked unit results](../evidence/solana-production-review-2026-10-11/pending-and-scheduler/unit-tests.log)
- [Strict TypeScript](../evidence/solana-production-review-2026-10-11/pending-and-scheduler/strict-typescript.log), [targeted lint](../evidence/solana-production-review-2026-10-11/pending-and-scheduler/targeted-lint.log), [production build](../evidence/solana-production-review-2026-10-11/pending-and-scheduler/production-build.log)

The earlier release gaps remain: fresh actual Devnet payment/recovery/concurrency and paid-boundary checks, signed Stripe/PayPal sandbox events, hosted scheduler observation, migration workflow and repository-wide type safety. These code fixes do not constitute full production release approval.


## PR preparation and full-workspace checks

The deployment inspection found Dokploy uses `.github/workflows/cron.yml`; native renewal is now included in its ten-minute resolver as well as `vercel.json`, with the runbook updated. A regression executes the actual route-resolution shell block without any HTTP/payment call. Hosted scheduler execution remains unverified.

History now shows pending, rather than failed/“Not charged,” for an unresolved retry matching the same provider, subscription and period. The original failed-attempt audit record is preserved, and unrelated/confirmed/refunded receipts remain unchanged. Four new unit cases cover these boundaries.

The final whole-repository unit run passed **3,979 tests across 262 files**. Its first run found three new-receipt sales-gate detector failures and one outdated media-analysis mock. The receipt writer is now correctly classified as held-subscription renewal/reconciliation rather than a new-sale entry point; the actual database sales gate remains intact. The media mock now models an awaited successful save. No product behavior was weakened to satisfy those assertions.

Final scoped strict TypeScript and production build passed. Logs are in `docs/evidence/solana-production-review-2026-10-11/pr-preparation/`. Log files were normalized only for trailing whitespace/terminal carriage returns before commit; outcomes and diagnostic text are retained. The full standalone 8 GB typecheck was not repeated. PR #962 remains draft because live payment, migration deployment and hosted scheduler sign-off are outstanding.
