# Solana subscription resilience and authorization follow-up

Date: 2026-10-11. Environment: local LMS and local Supabase, real Solana Devnet. Same student and subscription **10002** as the [original billing QA](solana-subscription-ui-2026-10-11.md).

**Verdict: payment settlement and receipt recovery passed; release readiness remains blocked by cancellation access behavior and incomplete recovery UI.** No mainnet, real funds, commits, pushes, or deployments.

## Renewal timing

The real test subscription uses `periodHours = 1`. Its next boundary was **18:38:45 UTC / 2:38:45 PM Caracas**. It was exercised after that actual boundary, without advancing database timestamps or mocking chain time.

A ten-minute native subscription interval is unsupported by the installed `@solana/subscriptions@0.4.0-rc.1`: its terms encode `periodHours` as unsigned integer hours. The [upstream program](https://github.com/solana-foundation/subscriptions/blob/main/program/src/constants.rs) converts hours to 3600 seconds. A different program deployment would be required; the existing interval was left unchanged. Faster synthetic tests would not prove the current Devnet program's renewal behavior.

## Real concurrency, lost HTTP response, and receipt-write failure

At **18:38:53 UTC**, two authenticated student retry requests and two authenticated cron requests were launched together. One student client deliberately aborted its HTTP request after 1.2 seconds, losing its response while the server continued. This exercised client transport uncertainty; it was not an RPC confirmation timeout.

A temporary PostgreSQL trigger rejected successful receipt persistence only for subscription 10002's **18:38:45–19:38:45 UTC** period. It did not alter transaction status, subscription timestamps, entitlement state, or chain state. This was deliberate fault injection against the real local API/database path. It was removed before recovery; a subsequent catalog check found zero matching triggers and functions.

Observed results:

- The non-aborted student request returned **503 `{status: "unconfirmed"}`**. Both cron responses reported **0 pulled, 0 reconciled, 1 error**. No API reported payment success while its receipt could not commit.
- The wallet decreased **9.94 → 9.93 USDC**, exactly one renewal. Chain state advanced to the real new period and showed the full 10,000 base-unit payment.
- Database history stayed at **three successful receipts**. Database paid-period end stayed **18:38:45 UTC**, and the failed commit did not extend entitlement access.
- After removing the fault, the actual authenticated retry returned **200 `paid`, `reconciled: true`**. It created receipt **10019**, dated from the actual transaction block time, and advanced the database paid period/entitlement expiry to **19:38:45 UTC**.
- The wallet remained **9.93 USDC** during recovery. Parsed finalized transaction balances verified subscriber **−10,000**, school **+9,500**, platform **+500** base units, in one atomic transaction.

Confirmed renewal transaction: [Devnet explorer](https://explorer.solana.com/tx/621tgGAN4zcHgU3aWWbfkgpTxdpd5dCBNaad8tG8gUu1FnUDnjfw8BbdF8YxXSnjwutMXt4iBXYW2hoBsbufUfco?cluster=devnet).

Browser evidence after the failed commit showed **Active**, an already elapsed renewal time, the old last-paid renewal, and three historical paid entries. It did not falsely add a new paid receipt, but **it lacked a pending-confirmation explanation or student recovery action**. Recovery was therefore exercised through the real authenticated HTTP API, not a billing button. After recovery, the browser showed four paid entries, the new receipt, and the correct next deadline.

## Actual authorization checks

Requests used real sessions from existing local test accounts. Tokens/cookies stayed in process memory and are excluded from artifacts.

| Request | Actual HTTP result |
| --- | --- |
| Retry without session | 401 |
| Retry from another origin | 403 |
| Retry another student's subscription | 404 |
| Retry owner's subscription from wrong school hostname | 404 |
| Retry wrong school while forging `x-tenant-id` | 404 |
| Invalid subscription ID | 400 |
| Nonexistent subscription ID | 404 |
| Cron with invalid secret | 401 |
| Build cancellation for another student's subscription | 404 |
| Cancellation build/verification from wrong school, before fix | **200 — isolation defect** |
| Cancellation build/verification from wrong school, after fix | 404 |
| Cancellation build/verification from another origin, after fix | 403 |
| Owner verifying its uncanceled subscription in correct school | 200, `canceled: false` |

The reproduced cancellation isolation defect was fixed in `cancel-tx` and `cancel-verify` by adding the current tenant filter and same-origin checks before privileged work. Retesting used the same actual requests. These were the only additional product changes in this follow-up.

## Real cancellation and charge suppression

The student's cancellation transaction was built through the actual authenticated `/cancel-tx` route, signed by the **existing Devnet test signer in a Node test harness**, submitted through the actual `/submit` relay, and finalized through `/cancel-verify`. Wallet-extension signing through the browser was not exercised.

[Confirmed cancellation transaction](https://explorer.solana.com/tx/3ecF16yEjet73LQNPN85vkE5kZTR6JX4iiKg3c5fmmhSUJBfnMskCB8kdxcv8gHtZgVJheb5ARqVmQ1jxgCh5YeJ?cluster=devnet). Verification and duplicate verification both returned **200 `canceled: true`**. Chain expiry became **19:38:45 UTC** and database status became `canceled`.

Subsequent overlapping cron and student retry requests produced **no charge**, no new receipt, and no chain-period advance. Both cron responses had all zero counters; retries returned `not_due`. Wallet balance remained **9.93 USDC**, and history remained four paid receipts. The fixture is intentionally left canceled after this test.

**Access finding:** cancellation at **18:40:53 UTC** immediately changed subscription entitlement 8 from `active` to `expired`, setting `revoked_at`, even though its `expires_at` and the chain cancellation deadline remained **19:38:45 UTC**. The existing `handle_subscription_status_change` trigger expires active subscription grants when status becomes `canceled`. An independently purchased product grant keeps this fixture's course available, masking the subscription access loss in course UI. Cancellation must retain paid access until the deadline if that is the intended policy; current behavior does not.

**UI finding:** billing removes the subscription card and says there is no active subscription. It preserves all four paid receipts, but does not show canceled status or the remaining paid-period deadline.

## Evidence and validation

- [Before resilience testing](../qa/solana-subscription-2026-10-11/18-before-resilience.png)
- [Real charge with failed receipt commit](../qa/solana-subscription-2026-10-11/19-receipt-write-failure-ui.png)
- [Recovered receipt without another charge](../qa/solana-subscription-2026-10-11/20-reconciled-without-second-charge.png)
- [Student billing after cancellation](../qa/solana-subscription-2026-10-11/21-canceled-billing.png)
- [Public API/chain/database evidence](../evidence/solana-subscription-resilience-2026-10-11/), including exact settlement assertions and temporary fault setup/removal SQL. No environment files, secrets, cookies, unsigned/signed wire transactions, or private signer files were copied.

**39 focused unit tests passed** across renewal, period decision, atomic split, and initial verification. Added cases cover failed receipt commits, reconciliation after confirmation uncertainty without another transfer, rejection of invalid receipt candidates, and canceled status suppression. These use mocked RPC/database dependencies. In particular, the low-level RPC confirmation timeout remains a mocked unit scenario; only HTTP response loss was injected live.

Targeted ESLint, whitespace checks, and strict TypeScript checking of changed payment/billing files plus imported dependencies passed. The full production build was previously successful, with the full standalone typecheck limitation documented in the original QA report; release-wide validation was deferred by the user.

Not exercised: the next actual renewal boundary after cancellation, browser Phantom signing, an exclusively subscription-owned course's UI lockout, automatic cron scheduling, staging/production deployment behavior, or mainnet. The canceled-due-period guard is covered by mocked unit cases; the live canceled requests occurred before the next boundary. These results do not constitute complete production sign-off.

## Shared cancellation production-review follow-up

The [shared subscription production-review report](solana-production-review-2026-10-11.md) documents the provider-agnostic cancellation/access repair and recovery UI. Stripe, Solana and final-at-provider PayPal now share the transition contract in the prepared implementation. It passed 126 mocked regressions, five prepared component browser tests, targeted lint, strict scoped TypeScript, and the final build. Docker became unavailable before the new migration could apply; live database/API/access checks remain blocked by the user's decision to leave Docker running. No new payment was submitted; subscription 10002 remains canceled, as confirmed by a new read-only Devnet snapshot. Release readiness remains unconfirmed.


## Final-code reverification — 2026-10-11

Local Supabase recovered without a Docker restart. The task migrations and rollback-only shared access contract now pass on local PostgreSQL, including two-session lifecycle concurrency with isolated synthetic periods. Final scoped strict TypeScript, targeted lint, production build, 133 mocked unit tests and seven prepared component browser tests pass. Authenticated desktop/mobile canceled billing and live API rejection evidence are recorded in the [updated shared review](solana-production-review-2026-10-11.md). New on-chain payments, actual paid-boundary expiry and signed Stripe/PayPal sandbox events remain unverified; historical live settlement here predates the final code. Mainnet remains deferred.
