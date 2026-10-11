# Independent production-readiness review — 2026-10-11

Reviewed current working-tree payment/subscription changes at approximately **3:42 PM Caracas**. No product changes, mainnet activity, funds movement, or persisted test fixtures were made in this review.

**Verdict: not ready for production release.** The shared cancellation/access changes pass their local contract, but a pending-payment UI regression remains and automatic Solana renewal scheduling is still deliberately disabled in repository configuration.

## Reproduced pending-payment regression

`begin_solana_renewal` persists `renewal_pending` without clearing the old `renewal_error`. This is a normal path after an insufficient-funds attempt: fund the wallet and start another attempt. If payment submission/confirmation/receipt persistence remains unresolved, both markers can remain present.

Billing page line 231 gates the entire pending expression with `!insufficientFunds`. Consequently an old insufficient-funds marker hides the current pending marker. After a reload, or when cron started the attempt, the student sees top-up/Retry payment instead of the pending explanation and recovery-only Check payment action. Local component `uncertain` state helps only after that component itself observes an error; it does not survive a reload or cover a background attempt. The existing browser transport-failure test checks only the same-page transition.

A rollback-only reproduction against **real local PostgreSQL RPCs** cloned an isolated subscription and plan, recorded a synthetic insufficient-funds failure, then called `begin_solana_renewal`. Result:

| Field | Result |
| --- | --- |
| subscription status | past_due |
| old error | insufficient_funds |
| pending marker | true |
| billing confirmation-unresolved expression | false |
| period history status | failed |

This verifies metadata coexistence and the incorrect billing expression, not a new real Devnet payment. If a subsequent transfer lands but its receipt cannot commit, the old failed history also continues to show “Not charged” despite unresolved settlement for the same period.

Fix pending-state precedence, and make period history reflect uncertainty while a newer attempt is unresolved. Add a regression that starts with an insufficient-funds receipt, begins a funded attempt, loses confirmation or receipt persistence, then reloads billing. Check payment must remain recovery-only and must never initiate another debit. Verify failed/not-charged history is not misleading during that interval.

The first isolated-fixture reproduction hit the existing user/plan uniqueness constraint and rolled back. The corrected reproduction cloned a separate plan and also rolled back. The original subscription 10002 was not changed.

## Automatic renewal scheduling

`vercel.json` does not schedule `/api/cron/solana-pull`. `.github/workflows/cron.yml` exposes it only through manual workflow dispatch; its scheduled cases omit the route. `docs/CRON_RUNBOOK.md` section 5 explicitly confirms native Solana subscriptions do not renew automatically under this configuration.

A successful manual call proves the endpoint works, not recurring production operation. Before enabling native Solana subscriptions, configure and verify a scheduler, or demonstrate an existing external scheduler and its monitoring. This review did not change schedules or send production payments.

## Checks independently repeated

- **136 unit tests passed** across nine files: subscription cancellation/state machine, webhook dispatcher, cancellation routes, Solana renewal/period decision/split/initial verification.
- **Scoped strict TypeScript passed:** `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tests/tsconfig.subscription-review.json`.
- **Shared local SQL contract passed**, rolled back: cancellation preserves exclusive paid access, simulated expiry removes it, duplicates/out-of-order events and delayed receipts preserve the contract, immediate termination remains terminal, independent product grants survive, and privileged execution is restricted.
- `git diff --check` passed.
- Inspected the prior agent's real canceled-billing screenshot and verification report. A fresh browser-tab inspection was blocked by browser security policy; no alternative browser route or surface was used to bypass it. Therefore this review does not claim a fresh live-browser check.

The earlier [production-review report](solana-production-review-2026-10-11.md) documents a successful build with type checking skipped by repository configuration, prepared component browser tests, live rejection checks, and SQL concurrency evidence. Those results do not replace final live settlement verification.

## Remaining sign-off evidence

After fixing the pending-state regression, exercise final-code live Devnet cancellation/renewal races, receipt-write failure recovery, and actual paid-boundary access expiry on new isolated fixtures. Keep historical subscription 10002 canceled. Exercise signed Stripe/PayPal sandbox lifecycle events for the shared contract. Complete normal migration-history/deployment integration and scheduled-job verification. Mainnet remains deferred; scoped type checking does not establish repository-wide type safety.


## Implementation follow-up

The later implementation fixes pending-marker precedence, clears stale balance errors when funded attempts begin, and displays unresolved period history as pending without rewriting the failed audit record. Both Vercel configuration and the actual Dokploy GitHub Actions route resolver now schedule native renewal every ten minutes. The runbook and regression coverage have been updated. See the [current QA report](solana-production-review-2026-10-11.md) for fresh checks and the remaining live release gates; the findings above describe the earlier reviewed state.
