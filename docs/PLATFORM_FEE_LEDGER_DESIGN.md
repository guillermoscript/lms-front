# Platform fee ledger, dunning cron and sales block — design spike (#929)

Status: design only, no code. De-risks wave 2 (migration, cron route, pay-now, UI, Playwright).
Depends on: #927 (fee bearer per product), #928 (earnings page hosts the balance card).
Read first: `lib/payments/payouts-owed.ts` (arithmetic + carry-forward rules),
`app/api/cron/expire-platform-subscriptions/route.ts` (cron pattern),
`docs/CRON_RUNBOOK.md`, `lib/billing/access-cutoff.ts` (what we must NOT copy).

## Summary for non-engineers

- **What the debt is.** When a student pays the school directly (bank transfer, personal Binance), the platform never sees the money, so it cannot keep its commission. That commission becomes a balance the school owes the platform, like a tab. Sales paid through the platform (Stripe etc.) are not part of it: the commission is already taken.
- **When it is due.** Each month is closed on the 1st and a statement (also the invoice) is issued. It is due 3 days later. The school can also pay any amount earlier, daily or weekly.
- **What happens if unpaid.** Reminder the day before, overdue notice at the due date, then after a grace period (proposed 7 days, owner decides) the school is "blocked": it cannot take NEW sales or new enrollments until the balance is paid. Paying unblocks it right away.
- **What blocking means.** Only new purchases and new enrollments stop. Admins and teachers keep working (courses, grading, community).
- **What is never blocked.** Students who already paid keep full access to their courses. Payments already in flight still complete. Existing automatic subscription renewals keep working. The school can always pay its balance.
- **Safety.** First release only sends notices, it does not block ("notify only"). Blocking is switched on by the platform owner after a dry run.

## Reference model: Guaybo

Source: https://docs.guaybo.com/es/comisiones. Summary of how they do it, and what this design does with each point.

| Guaybo behavior | This design |
|---|---|
| Commission accrues as a balance owed on sales paid directly to the creator (platform never holds the money) | **Adopts.** Fee ledger on `NOT bearsPlatformFee` rails (2.1). |
| Payable daily or weekly, not only at month end | **Adopts.** Partial/early pay-now allowed (2.4, Q7). |
| Due 3 days after month close | **Adopts.** `due_at = period_end + 3 days` (2.3). |
| Unpaid => account "moroso" and ALL product sales blocked until settled | **Adopts, softened.** Blocks new sales only after an extra grace (proposed 7 days, Q6; Guaybo blocks at due), a minimum blocking balance, and a `notify_only` rollout. Existing students never lose access (4.2). |
| Commissions are non-reversible on refunds | **Deviates.** Fees are netted against refunds, consistent with all other money sums (#547) (D3, Q1). |

## 0. Problem

On rails where the buyer pays the school directly (`manual`, `binance_personal`:
`bearsPlatformFee: false`, `settlesToPlatformAccount: false`) the platform never
touches the money, so it cannot take its commission in flight. With #927 a product can
declare that the platform commission is owed by the school. That commission becomes a
receivable ("Por pagar"). We need to (1) compute it, (2) let the school pay it, (3)
remind and finally stop NEW sales if unpaid, (4) invoice it, (5) never lock out students
who already paid.

Mirror image of `payouts-owed.ts`: there the platform owes the school; here the school
owes the platform. Same arithmetic discipline.

## 1. Decisions (recommended defaults, flagged where the owner must confirm)

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | Store accruals or derive them? | **Derive** from `transactions`; store only payments, frozen statements and standing. |
| D2 | Reuse `payouts`? | **No.** Wrong direction, `amount > 0` CHECK, `payout_method` semantics, `recorded_by` = super admin. New tables. |
| D3 | Fees refundable? | **Yes, net of refunds** via `netOfRefunds()`. Consistent with every other money sum (#547). Guaybo's "non-refundable" is a product choice; open Q1. |
| D4 | Overdue test | Stateless: `accrued(<= latest due boundary) - paid_all_time > MONEY_EPSILON`. No per-statement allocation. |
| D5 | Block scope | New **transaction inserts** and new self-enrollments only. Never `has_course_access`, never entitlements, never settlement of already-created rows. |
| D6 | Currency | Accrue per currency. Automated pay-now = USD only (platform billing is `expectedCurrency: 'usd'`). Other currencies: manual rail. Open Q2. |
| D7 | Scheduler | Route `/api/cron/enforce-platform-fees`, **pg_cron primary** via `invoke_cron_route`, `cron.yml` fallback (same shape as `enforce-plan-limits`). |
| D8 | Single block signal | `tenant_fee_standing.blocked_at`. One column decides (lesson of `cancel_at_period_end`, #545). |
| D9 | Renewals while blocked | Exempt ONLY native-provider renewals matched to a live subscription (4.2a). Crypto/manual renewals (no subscription object) count as new sales while blocked. Open Q3. |

## 2. Ledger

### 2.1 What is owed

For a tenant and currency, a transaction contributes to the fee ledger iff ALL hold:

- `status IN ('successful','refunded')` (refunded rows contribute 0 after netting; keep them so partial refunds stay `successful`).
- Fee is owed by the school: `NOT PROVIDER_CAPABILITIES[payment_provider].bearsPlatformFee` (money never reached the platform) AND the #927 bearer snapshot on the transaction says "school owes commission". Free (`amount = 0`) rows are skipped.
  - The bearer must be a **snapshot on the transaction** (DB-owned, frozen on UPDATE, like `school_percentage_snapshot` per #512), not read from the product at query time, or editing a product re-prices history (the #496 bug). That is #927's schema work; this doc only requires the column to exist and be trigger-frozen. Exact name is #927's call.
  - Never `revenue_splits.applies_to_providers` (retired #547). Capability map only.
- Rate = `100 - school_percentage_snapshot` (the transaction's own snapshot; legacy NULL falls back to current split, same as `payouts-owed.ts`).

Per row: `fee = roundMoney(netOfRefunds(amount, refunded_amount) * (100 - snapshot) / 100)`.
Round per row, then sum (the #547 residue rule). Order/filter by `transaction_date` (no `created_at`).

Sum is grouped by `currency` (never summed across).

### 2.2 Balance

```
accrued   = sum(fee rows)                 -- all time, net of refunds
paid      = sum(platform_fee_payments.amount where status = 'succeeded')   -- same currency
netOwed   = accrued - paid  ; reported as 0 if <= MONEY_EPSILON
overpaid  = paid - accrued when > MONEY_EPSILON else 0
```

Same rules as `payouts-owed.ts`: compare with `MONEY_EPSILON` (0.005), never 0; overpayment
carries forward (`payments.amount > 0` CHECK, no negative reverse rows); a refund after a
fee was paid lowers `accrued`, the excess shows as `overpaid` and is absorbed by future
accruals. A dormant school's overpayment is settled off-platform (say so in UI).
Implementation: `lib/payments/platform-fee-owed.ts`, pure function (no DB knowledge),
unit-tested like `payouts-owed`. #928 may ship a read-only version first using
`school_percentage_snapshot`; this module is its superset.

### 2.3 Tables (one migration, wave 2)

All tenant-scoped, RLS: tenant admins SELECT own rows; no INSERT/UPDATE grants to
`authenticated` (server-write-only, same stance as `transactions`, #538/#528).

`platform_fee_payments` — money received
- `payment_id` PK, `tenant_id`, `currency`, `amount NUMERIC(10,2) CHECK (amount > 0)`
- `provider` (platform billing rail slug), `provider_reference`, `provider_charge_id`
- `status` (`pending`,`succeeded`,`failed`,`canceled`), `paid_at`, `recorded_by` (manual confirm)
- `statement_id` nullable (informational link only; no allocation logic)
- UNIQUE `(provider, provider_charge_id)` where not null — webhook/Solana idempotency (one signature settles one payment)
- `idempotency_key` UNIQUE for server-initiated inserts

`platform_fee_statements` — the frozen monthly document AND the invoice
- `statement_id`, `tenant_id`, `currency`, `period_start`, `period_end`, UNIQUE `(tenant_id, currency, period_start)` (cron idempotency)
- `fee_amount` frozen at close (net of refunds as of close), `txn_count`
- `invoice_number` UNIQUE, format `PF-YYYYMM-<seq>`; `issued_at`, `due_at = period_end + 3 days`
- `issued_email_sent_at`, `reminder_sent_at`, `overdue_email_sent_at` stamps (status-gated sends)
- Statements are **documents, not the debt**. Debt is D4's stateless balance. A refund after close is not edited into the statement; it shows as credit in the next one (`prior_adjustment` column, informational).

`tenant_fee_standing` — one row per tenant (PK `tenant_id`)
- `state` (`ok`,`reminded`,`overdue`,`blocked`), `overdue_since`, `blocked_at`, `last_evaluated_at`
- `blocked_at IS NOT NULL` is the only thing the gate reads (D8). `state` is for UI and emails.
- `min_blocking_balance` is an app constant (propose 1.00 in the currency), not a column: never block a school over cents.

Why not reuse `invoices`? That table is student-purchase-shaped (`user_id`, `transaction_id`),
and `/api/invoices/[invoiceNumber]` today serves `payment_requests` invoices (student side),
not the `invoices` table. Statement-as-invoice avoids polluting student invoice lists. The
route gets a `PF-` prefix branch (platform-admin or tenant-admin of the owning tenant only) and
reuses `lib/invoice-generator`. Platform-issued docs need platform legal identity/tax fields: open Q4.

### 2.4 Pay-now

New route `POST /api/billing/fees/checkout` (NOT an overload of `/api/billing/checkout`,
which is plan/interval/subscription-switch shaped). Reuse its guards: authenticated, active
admin of tenant, rail resolved through `supportsPlatformBillingCheckout`. Server derives the
amount from the ledger (`min(netOwed, requested)` for daily partial pay; default = full
`netOwed`). **Never take the amount from the request body** (same rule as `transactions`).

Per rail (verify each during implementation; capability code is the source of truth):
- Stripe: Checkout Session `mode: 'payment'` on the platform account, metadata `{kind:'platform_fee', tenant_id, payment_id}`.
- Binance Pay (platform merchant): hosted order, correlation in `passThroughInfo`.
- Solana: QR page polls `/api/billing/solana/verify`; pending intent is a `platform_payment_requests` row with new `request_type='fee'` (extend the CHECK like `20260719160000`). `provider_charge_id` UNIQUE already gives one-signature-one-request. No webhook exists by design.
- Manual transfer: `platform_payment_requests` row `request_type='fee'`; super admin confirms; reuse `REQUEST_TTL_DAYS=14` and `OPEN_REQUEST_STATUSES` so an open request cannot be duplicated (`hasOpenPaymentRequest`). Per `payment_received` semantics an open request does NOT pause the block (see 3.3) — it only prevents duplicates.
- Lemon Squeezy: needs a variant that accepts a custom price. If not feasible, exclude LS from fee pay-now (capability-gate, don't branch on slug). Open Q5.
- PayPal: `supportsPlatformBillingCheckout` is subscription-shaped (Billing Subscriptions); one-off Orders are a different integration. Exclude from v1.

Settlement: `dispatchPlatformBillingEvent` (`lib/billing/platform-webhook-dispatch.ts`) gets a `kind==='platform_fee'` branch that inserts/updates `platform_fee_payments` idempotently by `(provider, provider_charge_id)`, then calls `reevaluateFeeStanding(tenantId)` synchronously so a paid school is unblocked immediately, not at the next cron run. `NormalizedBillingEvent.amount` is already MAJOR units; amount/currency mismatch vs the pending payment row => do not credit, flag for manual review (do not fall back to "full" like refunds do).

## 3. Cron: `/api/cron/enforce-platform-fees`

Auth: `Authorization: Bearer $CRON_SECRET` exactly like `expire-platform-subscriptions`.
Admin client created inside the handler; every phase status-gated so reruns are no-ops;
email failures swallowed via a `safeEmail`-style wrapper (never abort a transition);
returns a counts object (`statementsClosed`, `reminded`, `overdue`, `blocked`, `unblocked`, `errors`).
Runs daily. Each phase handles tenants in bounded batches (`.order().limit(N)` — PostgREST
refuses limited UPDATE without order, see PGRST109 note in the existing cron).

Timeline (UTC; period = calendar month):

| Day | Phase | Action |
|-----|-------|--------|
| 1st | 0. Close | For each tenant+currency with `accrued(<= period_end) > EPS` and no statement for the month: insert statement (unique key = idempotent), allocate `invoice_number`, email "statement issued, due in 3 days". Skip if balance already <= EPS after payments. |
| due-1 | 1. Reminder | Open balance, `reminder_sent_at IS NULL` => email + stamp, standing `reminded`. |
| due (1st+3) | 2. Overdue | Balance > EPS and `now > due_at` => standing `overdue`, `overdue_since`, overdue email + stamp. |
| due + FEE_GRACE_DAYS | 3. Block | `overdue` and `now > overdue_since + FEE_GRACE_DAYS` and balance >= `min_blocking_balance` => set `blocked_at`, "sales paused" email. `FEE_GRACE_DAYS` is NEW policy, proposed 7 (Guaybo blocks at due). Note: `GRACE_DAYS = 7` in `expire-platform-subscriptions` is only the renewal-reminder horizon (and the length of its downgrade window), not a precedent for a post-due grace; do not import it. Open Q6. |
| any | 4. Recover | Standing not `ok` and balance <= EPS => clear `blocked_at`, `overdue_since`, state `ok`, "sales resumed" email. Also runs synchronously on payment settle (2.4). |

Decision uses the stateless test (D4): re-derive the balance every run; stamps only control emails. A bad statement row can therefore never block a school whose live balance is paid.

Safety rails (this job can stop revenue, so):
- Dry-run query param `?dryRun=1` returns the would-act set, writes nothing. Required before first prod enable.
- Kill switch: stored in a new single-row table `platform_fee_config` (`id boolean PK DEFAULT true CHECK (id)`, `enforcement_mode text CHECK IN ('off','notify_only','enforce') DEFAULT 'notify_only'`, `updated_by`, `updated_at`), created in the wave-2 migration (the repo has no generic platform settings table). Read via admin client in the cron and by `is_tenant_sales_blocked` (returns false unless `enforce`); written only by super admin (RLS: super admin SELECT/UPDATE, no other grants). Env var rejected: flipping it needs a redeploy, too slow for a kill switch. Ship as `notify_only`. `blocked_at` is only written in `enforce`.
- Hard cap per run on newly blocked tenants (e.g. 25); excess logged to Sentry — a bug cannot block the whole platform in one tick.
- Never block a tenant whose platform subscription is the free plan with zero fee-bearing sales ever (balance is 0 anyway), and never block super-admin/platform tenant.
- Sentry cron monitor slug `cron-enforce-platform-fees` as in `cron.yml`.

Scheduling (per `docs/CRON_RUNBOOK.md`; GitHub has never been observed firing dailies for this repo):
- pg_cron job `enforce-platform-fees-daily` at `0 5 * * *` => `public.invoke_cron_route('enforce-platform-fees')` (pattern of `20260901150000_pg_cron_enforce_plan_limits.sql`). Appears in `cron_runs` and `/platform/billing-health`.
- `.github/workflows/cron.yml`: add schedule `0 6 * * *` as fallback AND the `workflow_dispatch` option AND the `case` branch (the case block is what takes effect; `vercel.json` is inert but keep in sync).
- Update `docs/CRON_RUNBOOK.md` (scheduler-of-record section + "is it alive?" line).
- Route is idempotent, so the documented pg_cron + GH double fire is safe; do not add Dokploy.

### 3.3 Interaction with existing payment requests

An open fee `platform_payment_request` does not pause the block (unlike the downgrade pause in
`expire-platform-subscriptions`): a stale unpaid promise must not keep a school selling.
Exception worth deciding: `payment_received` (money seen, not yet confirmed) DOES pause the
block — consistent with `isRequestOpen`, which treats it as open so a recoverable activation
failure never becomes money-without-service.

## 4. Sales block (the highest-risk part)

### 4.1 What is blocked

New `transactions` INSERT for a tenant with `blocked_at IS NOT NULL`, and new
self-enrollment of free offerings (`useEnrollment`/`enroll_user` for `amount = 0`).
Subject to D9, native-provider renewals matching 4.2a are allowed.

### 4.2 What is NEVER blocked or revoked

- `has_course_access()` and `entitlements` — must not reference `tenant_fee_standing`. This is NOT `access_cutoff_at`: that mechanism (`lib/billing/access-cutoff.ts`, `tenants.access_cutoff_at` read by `has_course_access`) deliberately revokes access for over-limit tenants. Copying it would lock out paying students. A contract unit test greps the `has_course_access` definition (latest migration) and fails if it mentions fee standing.
- Settlement of any row that already exists: webhooks/polls/manual confirm that UPDATE a `pending` transaction to `successful`, and `enroll_user()` called from them. A student who paid at 23:59 before the block is enrolled normally. The gate is on INSERT, not on `enroll_user`.
- Native-provider subscription renewals (Stripe/LS/PayPal webhooks), exempted by the precise rule in 4.2a.
- The school's own platform billing (plan checkout, fee pay-now). Paying must always work.
- Teachers/admins authoring, student progress, exams, community.

### 4.2a Renewal exemption (exact rule)

The trigger on `transactions` INSERT skips the block iff ALL hold, checked in SQL against rows, never against caller-supplied flags or settings:

1. `NEW.plan_id IS NOT NULL` and `NEW.product_id IS NULL`.
2. `NEW.provider_subscription_id IS NOT NULL`.
3. A `subscriptions` row exists with `tenant_id = NEW.tenant_id`, `user_id = NEW.user_id`, `plan_id = NEW.plan_id`, `provider_subscription_id = NEW.provider_subscription_id` and `subscription_status IN ('active','renewed','past_due')` (live set; `canceled`/`expired` are not).

Why this is not a bypass vector: `authenticated` has no INSERT grant on `transactions` (#538), so only server code (admin client / SECURITY DEFINER) can insert, and `provider_subscription_id` on a live `subscriptions` row is itself written only server-side from provider-verified events. A buyer cannot get a first purchase through this path because rule 3 requires a pre-existing live subscription created BEFORE the block (new subscriptions cannot be created while blocked, as their first transaction is a plain insert). Crypto rails and manual have no `provider_subscription_id`, so they never match and are blocked like new sales; that is the conservative choice (each period is a fresh payment, nothing is owed to the buyer) and the school unblocks by paying. The `app.bypass_fee_block` setting remains operator/seed only. Test: a Stripe webhook renewal lands while blocked; same insert with a forged/non-matching `provider_subscription_id` is refused with `LM003`.

### 4.3 Enforcement layers

1. **DB backstop** (authoritative, like #658): `BEFORE INSERT` trigger on `transactions` calls `is_tenant_sales_blocked(NEW.tenant_id)` and raises SQLSTATE `LM003`, message `sales_blocked`. (`LM001` = plan limit, `LM002` = tenant ban `lib/tenant/ban.ts` #892; repo and migrations grep shows no other `LM###`, so `LM003` is next free. Re-grep at implementation time.) Plus the same in the self-enroll path. Map with `isSalesBlockedError()` in `lib/billing/sales-block-error.ts` (never match message strings), like `isPlanLimitError`. `SET app.bypass_fee_block = 'on'` for operators/seed only.
2. **App pre-check** for a nicer message and to avoid creating provider sessions: `assertSalesOpen(tenantId)` called first in `app/api/payments/checkout`, `app/api/stripe/create-payment-intent`, `app/actions/payment-requests.ts`, the PayPal/Solana/Binance-personal start routes, and the enroll path. Unlike `findConflictingSubscription` (fail closed), this pre-check fails OPEN on a query error: unknown state must not stop sales. The DB trigger is the authoritative layer and reads one PK row.
3. Reads: `is_tenant_sales_blocked` is a STABLE SECURITY DEFINER SQL function on a PK lookup; cheap on the checkout path.

Check order (CLAUDE.md AI-route ethos applied): auth => access => role => sales gate => limits => side effects (a blocked checkout leaves no pending rows).

### 4.4 UX

- Student on a blocked school: neutral "this school isn't accepting new enrollments right now" on buy/enroll buttons. Do not reveal the fee debt to students.
- Admin: banner + balance card (hosted on #928 earnings page, plus a slim banner on `dashboard/admin/page.tsx`) with state, due date, amount, Pay-now, invoice link.
- **i18n (en/es):** all copy in `messages/en.json` + `messages/es.json` under a new `platformFees` namespace (banner per state `reminded/overdue/blocked`, balance card labels, pay-now, overpaid note, student neutral message). Amounts via `Intl.NumberFormat` with the locale; dates in UTC with the zone stated (R10). Emails (statement issued, reminder, overdue, sales paused, sales resumed) get en/es templates chosen by the recipient admin's locale, falling back to `en`. A unit test asserts en/es key parity for the namespace.
- **Loading:** balance card renders a skeleton (fixed height, no layout shift) while the ledger query runs; banner renders nothing until standing is known (never flashes a wrong state).
- **Error:** ledger/standing query failure shows an inline "could not load your balance, retry" in the card and NO banner (fail open, consistent with the pre-check); pay-now failure shows a toast with the localized error and leaves the button re-enabled; a settle mismatch (7) shows "payment under review" rather than a credit. Email send failure is swallowed and logged (never aborts a transition) and the stamp is not set, so the next run retries.
- **Empty:** zero balance shows "nothing owed", no banner.
- Super admin: extend `platform/billing-health` with counts by state and last cron run; manual "mark paid"/"waive" actions (waive = payment row `provider='waiver'`, `recorded_by`, note — keeps ledger append-only).

## 5. Risks and mitigations

| Id | Risk | Mitigation |
|----|------|------------|
| R1 | Cron bug blocks paying schools | Stateless re-derivation, kill switch `notify_only` default, dryRun, per-run block cap, min blocking balance, Playwright lifecycle spec. |
| R2 | Block revokes student access | Gate on INSERT only; contract test on `has_course_access`; lifecycle spec asserts an enrolled student still opens a course while blocked. |
| R3 | Trigger blocks provider-driven renewals or webhooks | Exact exemption 4.2a (row-based, no caller flags); trigger scoped to INSERT; add spec that a Stripe webhook renewal still lands. Needs careful review of every `transactions` insert site (admin client list). |
| R4 | Double count: platform already took fee in flight (Stripe Connect, PayPal, Solana) | Eligibility is `NOT bearsPlatformFee` AND #927 snapshot. Unit test enumerates all providers in `PROVIDER_CAPABILITIES` and asserts the eligible set. |
| R5 | Refund after fee paid | Net of refunds; carry-forward; `overpaid` reported; no clawback (same as `payouts-owed`). |
| R6 | Float residue / permanent $0.00 balance | `roundMoney` per row; `MONEY_EPSILON` compare; payments NUMERIC(10,2). |
| R7 | Amount tampering | Server derives pay-now amount; payment amount/currency mismatch not credited. |
| R8 | Double scheduling | pg_cron primary + GH fallback is documented; all phases idempotent (unique statement key, stamps). |
| R9 | Multi-currency | Per-currency balances; block if ANY currency over threshold; automated rails USD only; others via manual rail. |
| R10 | Time zone / month-end ambiguity | UTC everywhere; statement `period_*` stored as dates; documented in UI. |
| R11 | Migration touches `transactions` trigger (hot table) | Trigger is one PK lookup; ship behind `notify_only` so the function returns false until `enforce`. |
| R12 | Typecheck OOM locally | Verify wave-2 with scoped `tsc` per #926 notes; regenerate `lib/database.types.ts` via `npm run db:types`. |

## 6. Test plan

Unit (`tests/unit/`):
- `platform-fee-owed.test.ts`: per-row rounding, `.99` prices at odd splits (no residue), partial refund, full refund, snapshot vs current split, legacy NULL snapshot fallback, per-currency grouping, overpayment carry-forward, EPS threshold, provider eligibility matrix over `PROVIDER_CAPABILITIES`.
- `enforce-platform-fees.test.ts` (shape of `expire-platform-subscriptions.test.ts`): each phase status-gated and idempotent on re-run, email failure swallowed, dryRun writes nothing, `notify_only` never sets `blocked_at`, block cap, 401 without bearer.
- `sales-block-error.test.ts`; contract test for `has_course_access` not referencing fee standing; contract test that every `transactions` insert site calls `assertSalesOpen` (like `plan-feature-gate-contract.test.ts`).

Playwright `platform-fee-lifecycle.spec.ts` (needs its OWN dedicated tenant, created with the helpers in `tests/playwright/utils/plan-gate-fixtures.ts` plus a hidden `platform_plans` row, because standing is per-tenant state and the spec backdates transactions and flips `tenant_fee_standing`; never move the seeded tenants; set `platform_fee_config.enforcement_mode` per test and restore `notify_only` in teardown; `--workers=1`; `lvh.me`):
1. Seed fee-bearing manual transactions (backdate `transaction_date`, set `school_percentage_snapshot`) => balance card shows expected USD figure.
2. Run cron after month boundary (backdate rows, since the route has no clock param) => statement + invoice exist; admin sees due date.
3. Advance stamps past due+grace => cron blocks; new student checkout and free enroll refused with `LM003`/friendly page; **a student with a live entitlement still opens their course**; an in-flight pending manual request confirmed by the admin still enrolls.
4. Pay via manual rail: super admin confirms fee request => standing returns `ok` immediately, checkout works again.
5. Partial pay keeps blocked above threshold; full pay unblocks; overpay shows `overpaid`.
6. `notify_only` mode: emails/state but never blocks.
Models after `access-cutoff-lifecycle.spec.ts`, `platform-billing-manual-lifecycle.spec.ts`, `manual-sale-settlement.spec.ts`.

## 7. Wave 2 slicing (suggested, in order)

1. `lib/payments/platform-fee-owed.ts` + unit tests (pure; shares #928's read).
2. Migration: three tables, RLS/grants, `is_tenant_sales_blocked`, `reevaluate` helper, trigger (inert in `off`/`notify_only`), `request_type='fee'`, pg_cron job; regenerate types.
3. Cron route + `cron.yml` + `CRON_RUNBOOK.md` + billing-health tile.
4. Gate integration (`assertSalesOpen` at every insert site, error mapping, student UX).
5. Pay-now route + settlement branch (manual + Stripe first; Binance/Solana next).
6. Statement invoice page + route branch.
7. Admin balance card + banner; super-admin actions.
8. Playwright lifecycle spec; flip to `enforce` after one dry-run cycle in prod.

## 8. Open questions for the owner

1. Fees refundable (netted, recommended) or non-refundable like Guaybo?
2. Non-USD sales: accrue in original currency and pay manually (recommended), or convert to USD at sale time using `settlement_*`?
3. Native-provider subscription renewals stay allowed while blocked (4.2a, recommended); crypto/manual renewals blocked. OK?
4. Platform legal entity, tax id and numbering requirements for fee invoices (per country)?
5. Lemon Squeezy / PayPal: acceptable to omit from fee pay-now v1?
6. Grace: block at due date (Guaybo) or due + 7 days (recommended; new policy)? Minimum blocking balance value?
7. Pay-now: allow partial/daily payments (recommended, matches Guaybo) or only full statements?
8. Dormant tenants with long-unpaid balance and no sales: only notices + super-admin tooling, no automatic collection or deletion (recommended)?
