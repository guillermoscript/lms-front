# Student Solana subscription verification — 2026-10-11

Implemented the approved billing design and exercised all three requested flows against the local API and actual Solana Devnet. Initial payment and the earlier renewal were observed retrospectively. The insufficient-funds attempt and funded UI recovery were newly exercised in this session. No mainnet or real funds were used.

## Environment and fixture

- LMS: `http://lvh.me:3000/en/dashboard/student/billing`.
- Database: local Supabase, `127.0.0.1:54321`.
- Chain: `https://api.devnet.solana.com`; Devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- Existing student: `student@e2etest.com`; subscription **10002**, plan **1791732752**; **0.01 USDC per hour**.
- Subscription wallet: `FmJvMsNXi8xcXAh7qDwToEhijT9my4bkQKDtMUwZpHRj`.
- Subscription PDA: `CP8Jnkz23u7V1a2Nq3n7BBTjZYB5EjhicjHCLJNbvCGE`.
- Test course: **1002**, Web Development Basics. This student also has a separate permanent product entitlement for that course.

The user subsequently authorized product/UI changes and approved the recovery design. A migration was applied only to the local database. No subscription timestamps, wallet balances, payment statuses, or access rows were manually changed to simulate the live results. Devnet wallet funding was changed through real token transfers. Application state transitions used the real renewal API and its receipt-recording function.

## Results

| Flow | Actual action and evidence | Result |
| --- | --- | --- |
| Initial payment | Existing transaction **10006**, successful, $0.01; finalized initial school/platform transfers observed at **15:38:51 / 15:38:53 UTC** | Student history shows Paid, $0.01 and USDC · Solana. Initial payment was not submitted again. |
| Earlier successful renewal | Finalized school/platform transfers at **16:42:40 / 16:42:41 UTC**; actual API reconciled the missing receipt, **10009**, without submitting another charge | Student sees “Last renewal paid · 0.01 USDC,” its confirmed time, and both Devnet receipt links. Paid-through deadline **17:38:45 UTC** matches chain and subscription entitlement. Wallet stayed **9.95 USDC** during reconciliation. |
| Insufficient USDC | Waited for the real **17:38:45 UTC / 13:38:45 Caracas** boundary. Moved **9.95 Devnet USDC** to a temporary test wallet, leaving balance **0**. Called real cron endpoint at **17:40:13 UTC** | API returned `pulled: 0, reconciled: 0, insufficientFunds: 1, errors: 0`. Subscription became `past_due`; receipt **10012** was `failed`, with no charge ID and no payment signatures. Chain subscription period remained unchanged. |
| Student retry while empty | Clicked **Retry payment** in the existing student billing UI | UI showed “Your wallet has 0 USDC. Add enough to cover the 0.01 USDC renewal, then retry.” History showed Failed / Not charged. Same period receipt was reused. |
| Access after failure | Read entitlement deadlines and `has_course_access`; opened the course UI after restoring the expired login session | Subscription entitlement **8** stayed expired at **17:38:45 UTC**. Course access remained available through separate permanent product entitlement **2**. The notice was corrected to distinguish subscription access from separately purchased courses. |
| Recovery | Restored the Devnet USDC through a real token transfer, closed the temporary token account, then clicked **Retry payment** through the restored student session | UI entered “Confirming payment…” and then Active / Last renewal paid. Finalized recovery transaction at **17:55:33 UTC** charged **0.01 USDC** atomically: **0.0095** school, **0.0005** platform. Wallet ended at **9.94 USDC**. Receipt **10012** changed from failed to successful; total history count stayed **3**. |
| Paid-through recovery | Compared new chain period, DB subscription and entitlement | All align to start **17:38:45 UTC**, end **18:38:45 UTC / 14:38:45 Caracas**. Student UI shows next renewal at **6:38 PM UTC**. |
| Duplicate prevention | Called the real renewal endpoint again at **17:56:48 UTC** | `pulled: 0, reconciled: 0, insufficientFunds: 0, errors: 0`. Wallet, signatures, receipt rows, subscription and entitlement remained exactly unchanged. |

Recovery payment: [finalized Devnet transaction](https://explorer.solana.com/tx/52399aBp3147xaE2z4adLXkbP3gtcX8JV82dgQQDGWgtii2FmqXgPB7awETRCVr4wDMhJCtAtFdYdqAXE6eTyjq5?cluster=devnet).

## Implemented changes

- Clear USDC method, network, renewal amount, subscription wallet, and renewal time with an explicit time zone.
- Confirmed renewal history and Devnet explorer receipts; reconciliation verifies actual token debits and both receiving wallets before recovering missing receipts.
- Insufficient-funds notice, top-up guidance, and authenticated **Retry payment**, with a disabled confirming state and an explicit empty-wallet explanation.
- Recoverable `past_due` state. A paid renewal aligns access with the real on-chain deadline. A failed attempt does not grant another paid period.
- One receipt per subscription period; failed-to-paid recovery updates that receipt. A late failed worker cannot downgrade an already paid receipt.
- Atomic school/platform settlement, so the fee split cannot leave a new renewal partially charged.
- Same-origin, ownership and tenant checks before invoking the privileged renewal path. Real unauthenticated request: **401**; cross-origin request: **403**.
- Mobile-visible amount, status, method, timestamp and receipt links; desktop layout also checked. English and Spanish copy added.

## Evidence

Screenshots are actual browser captures, not rendered mockups. The confirming button state was observed in the browser DOM; the screenshot taken immediately afterward already shows the completed payment. They show both original behavior and exercised states. No continuous video/GIF recorder was available in the browser tools.

- [Original billing](../qa/solana-subscription-2026-10-11/01-billing-baseline.jpg)
- [Confirmed renewal and mobile history](../qa/solana-subscription-2026-10-11/09-confirmed-history-full.png)
- [Desktop renewal details](../qa/solana-subscription-2026-10-11/10-desktop-renewal.png)
- [Real failed renewal history](../qa/solana-subscription-2026-10-11/11-insufficient-funds-full.png)
- [Empty-wallet UI retry](../qa/solana-subscription-2026-10-11/12-empty-wallet-ui-retry.png)
- [Corrected subscription-access notice before recovery](../qa/solana-subscription-2026-10-11/14-funded-before-ui-recovery.jpg)
- [Separately owned course remains available](../qa/solana-subscription-2026-10-11/13-separately-owned-course-remains-accessible.jpg)
- [UI immediately after recovery](../qa/solana-subscription-2026-10-11/15-immediate-ui-recovery.png)
- [Recovered billing and three paid entries](../qa/solana-subscription-2026-10-11/16-recovered-billing-full.png)
- [Recovered subscription summary](../qa/solana-subscription-2026-10-11/17-recovered-summary.jpg)

The failed-state screenshots preceded the correction that clarifies independent course ownership. The corrected notice is shown in the pre-recovery screenshot.

[Raw non-secret evidence](../evidence/solana-subscription-2026-10-11/) includes snapshots before/after failure/recovery, API results, public funding signatures, parsed finalized transfers, and focused test logs. Signer files and environment files are excluded. The temporary escrow signer was removed after funds were restored and its token account closed. The existing test wallet signer was preserved.

## Follow-up

The [resilience and authorization follow-up](solana-subscription-resilience-2026-10-11.md) records subsequent real concurrent renewal/receipt failure recovery and cancellation tests. The fixture was subsequently canceled. That follow-up also identifies pending-confirmation UI and cancellation paid-access gaps, so the earlier successful payment results are not production sign-off.

## Validation and limits

- **35 Solana unit tests passed** (24 renewal/split/decision tests plus 11 existing initial-verification route tests). These use mocked RPC/puller responses and are separate from the live Devnet results above.
- **Rollback-only SQL contract checks passed**: student execution privilege denied, failed status, recoverable subscription, receipt reuse, late-failure guard, and entitlement deadline alignment. Their synthetic future period/signature never persisted and was not a Devnet payment.
- Targeted ESLint and whitespace checks passed.
- Production build: **passed** (`npm run build`). This repository sets `typescript.ignoreBuildErrors: true`; full standalone typecheck exhausted its configured **8 GB heap** before returning diagnostics. **The smaller strict TypeScript check of all changed TypeScript files and their imported dependencies passed.** The first sandboxed attempt failed because Turbopack could not bind a local port; overlapping checks were stopped after local authentication/browser loads slowed, and the build was restarted sequentially with the required process/port access.
- The existing initial receipt has no stored payment method or explorer signature metadata. Its payment was validated retrospectively against finalized chain transfers; this session did not repeat the initial checkout.
- The insufficient-funds result came from the real API reading a real **0-USDC Devnet balance**. The API precheck correctly avoided submitting a doomed transaction; this was not an on-chain rejected transfer or a mocked balance.
- Renewal was manually triggered through the actual cron endpoint; automatic scheduling was not exercised or configured in this session.
- An exclusively subscription-owned course lockout was **not** exercised with this fixture, because its only linked course is also permanently owned. The subscription deadline and independent-course behavior were verified directly. No entitlements were deleted to force a lockout.
- The student session expired during the extended test and an initial login attempt timed out. A second login using the same existing fixture succeeded before the funded UI retry. There were also browser load timeouts and unrelated gamification 503 / auth-session warnings. These are environmental gaps, not successful payment evidence.
- No mainnet transactions, real funds, credentials in evidence, commits, pushes, or deployments.

## Shared cancellation production-review follow-up

The [shared subscription production-review report](solana-production-review-2026-10-11.md) records the subsequent provider-agnostic implementation, 126 mocked regressions, five labeled component browser tests, scoped strict typecheck, and final production build. Local Docker failed before the new migration could apply; database contract tests and new live cancellation/access/payment flows remain blocked. The earlier live results above are historical evidence, not validation of the new implementation.


## Final-code reverification — 2026-10-11

Local Supabase recovered without a Docker restart. The task migrations and rollback-only shared access contract now pass on local PostgreSQL, including two-session lifecycle concurrency with isolated synthetic periods. Final scoped strict TypeScript, targeted lint, production build, 133 mocked unit tests and seven prepared component browser tests pass. Authenticated desktop/mobile canceled billing and live API rejection evidence are recorded in the [updated shared review](solana-production-review-2026-10-11.md). New on-chain payments, actual paid-boundary expiry and signed Stripe/PayPal sandbox events remain unverified; historical live settlement here predates the final code. Mainnet remains deferred.
