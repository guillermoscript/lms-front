# Platform fee ledger, dunning cron and sales block — design spike (#929)

Status: design only, no code. Owner decisions recorded (section 8). De-risks wave 2 (migration, cron route, pay-now, UI, Playwright).
Depends on: #927 (fee bearer per product), #928 (earnings page hosts the balance card).
Read first: `lib/payments/payouts-owed.ts` (arithmetic + carry-forward rules),
`app/api/cron/expire-platform-subscriptions/route.ts` (cron pattern),
`docs/CRON_RUNBOOK.md`, `lib/billing/access-cutoff.ts` (what we must NOT copy).

## Summary for non-engineers

- **What the debt is.** When a student pays the school directly (bank transfer, personal Binance), the platform never sees the money, so it cannot keep its commission. That commission becomes a balance the school owes the platform, like a tab. Sales paid through the platform (Stripe etc.) are not part of it: the commission is already taken.
- **When it is due.** Each month is closed on the 1st and a monthly statement is issued (a non-fiscal statement in v1, not a tax invoice; see 2.5). It is due 3 days later. The school can also pay any amount earlier, daily or weekly.
- **What happens if unpaid.** Reminder the day before, overdue notice at the due date, then after a 7-day grace period (decided) the school is "blocked": it cannot take NEW sales or new enrollments until the balance is paid. Paying unblocks it right away.
- **What blocking means.** Only new purchases and new enrollments stop. Admins and teachers keep working (courses, grading, community).
- **What is never blocked.** Students who already paid keep full access to their courses. Payments already in flight still complete. A student who already holds a subscription can still renew it, on every payment method (owner decision; precise rule in 4.2a). The school can always pay its balance.
- **Other currencies.** Sales in hyperinflation currencies (VES to start) are converted to USD at the moment of sale and the school owes the commission in USD at that frozen rate. Every other currency is tracked in its own currency and never added to another.
- **Safety.** First release only sends notices, it does not block ("notify only"). Blocking is switched on by the platform owner after one real billing cycle in notify-only (default, owner did not answer; Q8).

## Reference model: Guaybo

Source: https://docs.guaybo.com/es/comisiones. Summary of how they do it, and what this design does with each point.

| Guaybo behavior | This design |
|---|---|
| Commission accrues as a balance owed on sales paid directly to the creator (platform never holds the money) | **Adopts.** Fee ledger on `NOT bearsPlatformFee` rails (2.1). |
| Payable daily or weekly, not only at month end | **Adopts.** Partial/early pay-now allowed (2.4, carried default). |
| Due 3 days after month close | **Adopts.** `due_at = period_end + 3 days` (2.3). |
| Unpaid => account "moroso" and ALL product sales blocked until settled | **Adopts, softened.** Blocks new sales only after an extra 7-day grace (decided, Q4; Guaybo blocks at due), a minimum blocking balance, and a `notify_only` rollout. Existing students never lose access (4.2). |
| Commissions are non-reversible on refunds | **Deviates (decided, Q1).** Fees are netted against refunds, consistent with all other money sums (#547) (D3). |
| VES sales: commission invoiced to the seller in Bs at the BCV rate, plus 16% IVA | **Adopts the rate idea only.** Hyperinflation currencies are converted to USD at sale time, BCV official rate proposed (D6, 2.1). Fiscal invoicing with IVA is deferred (2.5, Q5). |

## 0. Problem

On rails where the buyer pays the school directly (`manual`, `binance_personal`:
`bearsPlatformFee: false`, `settlesToPlatformAccount: false`) the platform never
touches the money, so it cannot take its commission in flight. With #927 a product can
declare that the platform commission is owed by the school. That commission becomes a
receivable ("Por pagar"). We need to (1) compute it, (2) let the school pay it, (3)
remind and finally stop NEW sales if unpaid, (4) issue a monthly statement for it, (5) never lock out students
who already paid.

Mirror image of `payouts-owed.ts`: there the platform owes the school; here the school
owes the platform. Same arithmetic discipline.

## 1. Decisions (recommended defaults, flagged where the owner must confirm)

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | Store accruals or derive them? | **Derive** from `transactions`; store only payments, frozen statements and standing. |
| D2 | Reuse `payouts`? | **No.** Wrong direction, `amount > 0` CHECK, `payout_method` semantics, `recorded_by` = super admin. New tables. |
| D3 | Fees refundable? | **Yes, net of refunds** via `netOfRefunds()`. Consistent with every other money sum (#547). Guaybo's "non-refundable" is a product choice. Decided (Q1). |
| D4 | Overdue test | Stateless: `accrued(<= latest due boundary) - paid_all_time > MONEY_EPSILON`. No per-statement allocation. |
| D5 | Block scope | New **transaction inserts** and new self-enrollments only. Never `has_course_access`, never entitlements, never settlement of already-created rows. |
| D6 | Currency | **Decided (Q2).** Currencies in `platform_fee_config.hyperinflation_currencies` (VES initially) are converted to USD AT SALE TIME; the ledger tracks the stored USD amount and never re-converts. All other currencies accrue per currency, never summed across currencies. Automated pay-now = USD only (platform billing is `expectedCurrency: 'usd'`); other currencies via manual rail. |
| D7 | Scheduler | Route `/api/cron/enforce-platform-fees`, **pg_cron primary** via `invoke_cron_route`, `cron.yml` fallback (same shape as `enforce-plan-limits`). |
| D8 | Single block signal | `tenant_fee_standing.blocked_at`. One column decides (lesson of `cancel_at_period_end`, #545). |
| D9 | Renewals while blocked | **Decided (Q3).** A student who holds a subscription can still renew it on ANY rail: native (provider subscription id match) and crypto/manual (no subscription object; matched on the held `subscriptions` row). A lapsed/canceled subscription or a plan the student never held is a new sale and is blocked. Exact predicate in 4.2a. |
| D10 | Ledger key | **Decided (Q7).** Eligibility keys on `transactions.payment_provider` (the slug on the row), looked up in `PROVIDER_CAPABILITIES`, never on `products.payment_provider` (editable after the fact, re-prices history like #496). |

## 2. Ledger

### 2.1 What is owed

For a tenant and currency, a transaction contributes to the fee ledger iff ALL hold:

- `status IN ('successful','refunded')` (refunded rows contribute 0 after netting; keep them so partial refunds stay `successful`).
- Fee is owed by the school: `NOT PROVIDER_CAPABILITIES[payment_provider].bearsPlatformFee` (money never reached the platform) AND the #927 bearer snapshot on the transaction says "school owes commission". Free (`amount = 0`) rows are skipped.
  - The bearer must be a **snapshot on the transaction** (DB-owned, frozen on UPDATE, like `school_percentage_snapshot` per #512), not read from the product at query time, or editing a product re-prices history (the #496 bug). That is #927's schema work; this doc only requires the column to exist and be trigger-frozen. Exact name is #927's call.
  - Never `revenue_splits.applies_to_providers` (retired #547). Capability map only.
- Eligibility is decided from the row's own `payment_provider` slug (D10).
- Rate = `100 - school_percentage_snapshot` (the transaction's own snapshot; legacy NULL falls back to current split, same as `payouts-owed.ts`).

Per row: `fee = roundMoney(netOfRefunds(amount, refunded_amount) * (100 - snapshot) / 100)`.
Round per row, then sum (the #547 residue rule). Order/filter by `transaction_date` (no `created_at`).

Sum is grouped by ledger currency (never summed across currencies).

**Hyperinflation currencies (decided, Q2).** If the row's `currency` is in `platform_fee_config.hyperinflation_currencies` (VES initially, editable by super admin), the ledger works in USD from a snapshot taken when the transaction is inserted:

- New `transactions` columns, written once at insert by server code and frozen on UPDATE by trigger (same stance as `school_percentage_snapshot`, #512): `fx_rate_to_usd NUMERIC` (USD per 1 unit of the sale currency), `fx_rate_source TEXT`, `fx_rate_date DATE`, `usd_amount NUMERIC(10,2)`. NULL for rows not in a hyperinflation currency.
- Rate source proposal: BCV official rate for VES (what Guaybo uses), fetched server-side and stored daily in a small `platform_fx_rates(currency, rate_date, rate, source)` table so insert-time lookup is a PK read. Flag: the parallel (non-official) rate is the alternative; it is closer to the street price but has no official publisher, so it needs a chosen vendor and is harder to defend in a dispute. `fx_rate_source` records which one was used, so the choice can change later without touching history. Owner to confirm BCV (open point inside Q2).
- If no rate exists for the sale date, use the most recent earlier one and set `fx_rate_source` to `<source>:stale`; never fail the sale over a missing rate.
- Fee base is `usd_amount` net of refunds: `usd_net = roundMoney(usd_amount * (amount - refunded_amount) / amount)`; a partial refund in VES is converted with the row's own stored rate, **never re-converted at a later rate**. Then `fee = roundMoney(usd_net * (100 - snapshot) / 100)` and the row lands in the `USD` ledger bucket.
- Rows in other currencies skip all of this and keep their own currency bucket. A school can therefore have a USD bucket (native USD sales plus converted VES) and, e.g., a EUR bucket; they are never added together.
- `settlement_*` columns are for Solana on-chain verification and are not reused here.

### 2.2 Balance

All figures below are per ledger currency bucket (USD includes converted hyperinflation sales, 2.1).

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
- `payment_id` PK, `tenant_id`, `currency` (ledger bucket), `amount NUMERIC(10,2) CHECK (amount > 0)`
- `provider` (platform billing rail slug), `provider_reference`, `provider_charge_id`
- `status` (`pending`,`succeeded`,`failed`,`canceled`), `paid_at`, `recorded_by` (manual confirm)
- `statement_id` nullable (informational link only; no allocation logic)
- UNIQUE `(provider, provider_charge_id)` where not null — webhook/Solana idempotency (one signature settles one payment)
- `idempotency_key` UNIQUE for server-initiated inserts

`platform_fee_statements` — the frozen monthly NON-FISCAL statement (v1; see 2.5)
- `statement_id`, `tenant_id`, `currency`, `period_start`, `period_end`, UNIQUE `(tenant_id, currency, period_start)` (cron idempotency)
- `fee_amount` frozen at close (net of refunds as of close), `txn_count`
- `lines JSONB` frozen at close: per source currency `sales_total`, `sales_count`, and for hyperinflation currencies the rate(s) and source used plus the USD subtotal; `payments_total` and `closing_balance` as of close. This is what the statement renders, so it never recomputes from live rows.
- `statement_number` UNIQUE, format `PF-YYYYMM-<seq>` (an internal reference, explicitly not a fiscal invoice number); `issued_at`, `due_at = period_end + 3 days`
- `issued_email_sent_at`, `reminder_sent_at`, `overdue_email_sent_at` stamps (status-gated sends)
- Statements are **documents, not the debt**. Debt is D4's stateless balance. A refund after close is not edited into the statement; it shows as credit in the next one (`prior_adjustment` column, informational).

`tenant_fee_standing` — one row per tenant (PK `tenant_id`)
- `state` (`ok`,`reminded`,`overdue`,`blocked`), `overdue_since`, `blocked_at`, `last_evaluated_at`
- `blocked_at IS NOT NULL` is the only thing the gate reads (D8). `state` is for UI and emails.
- `min_blocking_balance` is an app constant (propose 1.00 in the currency), not a column: never block a school over cents.

Why not reuse `invoices`? That table is student-purchase-shaped (`user_id`, `transaction_id`),
and `/api/invoices/[invoiceNumber]` today serves `payment_requests` invoices (student side),
not the `invoices` table. A separate statements table avoids polluting student invoice lists. The
route gets a `PF-` prefix branch (platform-admin or tenant-admin of the owning tenant only) and
reuses `lib/invoice-generator` to render the statement. Fiscal invoicing is deferred (2.5, Q5).

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
- Lemon Squeezy and PayPal: **left out of pay-now v1 (decided, Q6).** LS would need a variant accepting a custom price; PayPal's `supportsPlatformBillingCheckout` is subscription-shaped and one-off Orders are a different integration. A school whose only platform rail is one of these pays via the manual transfer rail. Implement as a pay-now capability flag, don't branch on slug.

Settlement: `dispatchPlatformBillingEvent` (`lib/billing/platform-webhook-dispatch.ts`) gets a `kind==='platform_fee'` branch that inserts/updates `platform_fee_payments` idempotently by `(provider, provider_charge_id)`, then calls `reevaluateFeeStanding(tenantId)` synchronously so a paid school is unblocked immediately, not at the next cron run. `NormalizedBillingEvent.amount` is already MAJOR units; amount/currency mismatch vs the pending payment row => do not credit, flag for manual review (do not fall back to "full" like refunds do).

### 2.5 Statement now, fiscal invoice later (decided, Q5)

**v1 ships a NON-FISCAL monthly statement**: period, sales per currency, commission per currency, USD rate used (hyperinflation currencies), payments received, closing balance, due date. It carries the label "Statement, not a tax invoice". It is the document the school pays against; it does not satisfy any country's invoicing rules and must not be presented as doing so.

**Fiscal invoices come later** and need, before any build starts:

- Platform legal name and tax id (and the issuing country/entity if more than one).
- Sequential, gap-free numbering per the issuing country's rules (separate from `statement_number`).
- The school's tax id and legal name collected in billing settings.
- Local tax on the commission: IVA/VAT where it applies, with rate and rounding per jurisdiction.

How comparable platforms do it, for orientation (not legal advice): Guaybo invoices the seller for its commission in bolivares at the BCV rate with 16% IVA, i.e. a real local invoice in local currency. Stripe Connect platforms that charge `application_fee_amount` are themselves responsible for invoicing and taxing their fee to the connected account under local law; Stripe moves the money but does not issue the platform's invoice for it. Our situation is the Guaybo one (commission collected outside any processor), so expect a per-country invoice, not a statement.

**Recommend an accountant confirms the requirements per country** (at least Venezuela and each other country with active schools) before building fiscal invoices, and before telling any school the statement has tax value.

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
| 1st | 0. Close | For each tenant+currency with `accrued(<= period_end) > EPS` and no statement for the month: insert statement (unique key = idempotent), allocate `invoice_number`, email "statement issued, due in 3 days" (statement phase freezes `lines`, 2.3). Skip if balance already <= EPS after payments. |
| due-1 | 1. Reminder | Open balance, `reminder_sent_at IS NULL` => email + stamp, standing `reminded`. |
| due (1st+3) | 2. Overdue | Balance > EPS and `now > due_at` => standing `overdue`, `overdue_since`, overdue email + stamp. |
| due + FEE_GRACE_DAYS | 3. Block | `overdue` and `now > overdue_since + FEE_GRACE_DAYS` and balance >= `min_blocking_balance` => set `blocked_at`, "sales paused" email. `FEE_GRACE_DAYS = 7` (decided, Q4; Guaybo blocks at due). Note: `GRACE_DAYS = 7` in `expire-platform-subscriptions` is only the renewal-reminder horizon (and the length of its downgrade window), not a precedent for a post-due grace; do not import it, define `FEE_GRACE_DAYS` separately. |
| any | 4. Recover | Standing not `ok` and balance <= EPS => clear `blocked_at`, `overdue_since`, state `ok`, "sales resumed" email. Also runs synchronously on payment settle (2.4). |

Decision uses the stateless test (D4): re-derive the balance every run; stamps only control emails. A bad statement row can therefore never block a school whose live balance is paid.

Safety rails (this job can stop revenue, so):
- Dry-run query param `?dryRun=1` returns the would-act set, writes nothing. Required before first prod enable.
- Kill switch: stored in a new single-row table `platform_fee_config` (`id boolean PK DEFAULT true CHECK (id)`, `enforcement_mode text CHECK IN ('off','notify_only','enforce') DEFAULT 'notify_only'`, `updated_by`, `updated_at`), created in the wave-2 migration (a dedicated table, see the note below). Read via admin client in the cron and by `is_tenant_sales_blocked` (returns false unless `enforce`); written only by super admin (RLS: super admin SELECT/UPDATE, no other grants). The same row holds `hyperinflation_currencies text[] DEFAULT '{VES}'` (2.1). Env var rejected: flipping it needs a redeploy, too slow for a kill switch. Ship as `notify_only`; move to `enforce` after one real billing cycle in `notify_only` (default, owner did not answer; Q8). `blocked_at` is only written in `enforce`.

  Verified by grep: a generic table DOES exist, `system_settings` (migration `20260214005643`: key/value JSONB, `category` CHECK limited to general/email/payment/enrollment, RLS lets any user with an `admin` row in `user_roles` read and write, not just super admins; no app code reads it, only `lib/database.types.ts` mentions it; later migrations not re-audited). It is rejected for this use on purpose: a kill switch and FX list that any school admin could edit, with no typed CHECK on the mode, is the wrong home. Keep `platform_fee_config`.
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
Subject to D9, renewals of a subscription the student already holds, on any rail, matching 4.2a are allowed.

### 4.2 What is NEVER blocked or revoked

- `has_course_access()` and `entitlements` — must not reference `tenant_fee_standing`. This is NOT `access_cutoff_at`: that mechanism (`lib/billing/access-cutoff.ts`, `tenants.access_cutoff_at` read by `has_course_access`) deliberately revokes access for over-limit tenants. Copying it would lock out paying students. A contract unit test greps the `has_course_access` definition (latest migration) and fails if it mentions fee standing.
- Settlement of any row that already exists: webhooks/polls/manual confirm that UPDATE a `pending` transaction to `successful`, and `enroll_user()` called from them. A student who paid at 23:59 before the block is enrolled normally. The gate is on INSERT, not on `enroll_user`.
- Renewals of a subscription the student already holds, on every rail (native webhooks, crypto, manual), exempted by the precise rule in 4.2a.
- The school's own platform billing (plan checkout, fee pay-now). Paying must always work.
- Teachers/admins authoring, student progress, exams, community.

### 4.2a Renewal exemption (exact rule)

Final rule (decided, Q3, D9): **a student who already holds a subscription can still renew it while the school is blocked, on every rail. Anything that is not a renewal of a held subscription is a new sale and is blocked.** Subscription *creation* from a purchase that already existed before the block is settlement of an existing row, not a new sale (4.2), and also continues.

Implemented once as SQL function `is_subscription_renewal(tenant_id, user_id, plan_id, payment_provider, provider_subscription_id)`, used by the trigger AND by the app pre-check so the two cannot drift. The `transactions` INSERT trigger skips the block iff `NEW.plan_id IS NOT NULL`, `NEW.product_id IS NULL` and one of these holds, checked against rows, never against caller-supplied flags or settings:

- **A. Native renewal (provider subscription object).** `NEW.provider_subscription_id IS NOT NULL` and EITHER
  1. a `subscriptions` row exists with the same `tenant_id`, `user_id`, `plan_id`, `provider_subscription_id` and `subscription_status IN ('active','renewed','past_due')` (live set; `canceled`/`expired` are not), OR
  2. **(gap fix)** no live row exists YET but a prior `transactions` row exists with the same `tenant_id`, `user_id`, `plan_id`, `payment_provider` and `provider_subscription_id` (any status except `failed`). Reason: a provider webhook such as Stripe `customer.subscription.created` / `invoice.payment_succeeded` can arrive after `blocked_at` is set for a checkout the student started before the block. The `subscriptions` row is only created when the first payment settles, so rule A.1 alone would refuse the first invoice's transaction of a subscription that was legitimately in flight, i.e. money taken with no service. A.2 anchors on the pre-existing transaction instead. It is not a bypass: the prior row can only have been inserted before the block (new first purchases are refused), `authenticated` cannot insert transactions (#538), and `provider_subscription_id` is written only by server code from provider-verified events.
- **B. Self-managed renewal (crypto/manual; no subscription object, no `provider_subscription_id`).** A `subscriptions` row exists with the same `tenant_id`, `user_id`, `plan_id`, a live `subscription_status` and a `payment_provider` equal to `NEW.payment_provider` (verify the column and, for crypto, that the row survives past its period end until the `selfManagedPeriod` expiry; if it does not, anchor on the latest `successful` plan transaction of that user/plan/provider instead). A student whose subscription already lapsed or was canceled is buying again, not renewing, and is blocked. Manual renewals: the confirm step inserts/settles the row, so `payment-requests` creation applies the same predicate in the pre-check and must not refuse a held-subscription renewal request.

Why this is not a bypass vector: renewal requires a subscription (or a pre-block in-flight transaction) that already exists, which can only have been created before the block, since a first purchase during a block is a plain insert and is refused. A student cannot switch to a different plan or provider through this path (plan and provider must match). The cost to the school is bounded: they already earn only from students they already had. The `app.bypass_fee_block` setting remains operator/seed only.

Tests: (1) a Stripe webhook renewal lands while blocked; (2) a Stripe first-invoice transaction for a checkout started before the block lands while blocked (gap fix A.2); (3) a crypto and a manual renewal of a live subscription land while blocked; (4) the same insert with a forged/non-matching `provider_subscription_id`, a different plan, a lapsed subscription, or a student with no subscription is refused with `LM003`.

### 4.3 Enforcement layers

1. **DB backstop** (authoritative, like #658): `BEFORE INSERT` trigger on `transactions` calls `is_tenant_sales_blocked(NEW.tenant_id)` and raises SQLSTATE `LM003`, message `sales_blocked`. (`LM001` = plan limit, `LM002` = tenant ban `lib/tenant/ban.ts` #892; repo and migrations grep shows no other `LM###`, so `LM003` is next free. Re-grep at implementation time.) Plus the same in the self-enroll path. Map with `isSalesBlockedError()` in `lib/billing/sales-block-error.ts` (never match message strings), like `isPlanLimitError`. `SET app.bypass_fee_block = 'on'` for operators/seed only.
2. **App pre-check** for a nicer message and to avoid creating provider sessions: `assertSalesOpen(tenantId)` called first in `app/api/payments/checkout`, `app/api/stripe/create-payment-intent`, `app/actions/payment-requests.ts`, the PayPal/Solana/Binance-personal start routes (renewals pass via `is_subscription_renewal`, 4.2a), and the enroll path. Unlike `findConflictingSubscription` (fail closed), this pre-check fails OPEN on a query error: unknown state must not stop sales. The DB trigger is the authoritative layer and reads one PK row.
3. Reads: `is_tenant_sales_blocked` is a STABLE SECURITY DEFINER SQL function on a PK lookup; cheap on the checkout path.

Check order (CLAUDE.md AI-route ethos applied): auth => access => role => sales gate => limits => side effects (a blocked checkout leaves no pending rows).

### 4.4 UX

- Student on a blocked school: neutral "this school isn't accepting new enrollments right now" on buy/enroll buttons. Do not reveal the fee debt to students.
- Admin: banner + balance card (hosted on #928 earnings page, plus a slim banner on `dashboard/admin/page.tsx`) with state, due date, amount, Pay-now, invoice link.
- **i18n (en/es):** all copy in `messages/en.json` + `messages/es.json` under a new `platformFees` namespace (banner per state `reminded/overdue/blocked`, balance card labels, pay-now, overpaid note, student neutral message). Amounts via `Intl.NumberFormat` with the locale; dates in UTC with the zone stated (R10). Emails (statement issued, reminder, overdue, sales paused, sales resumed) get en/es templates. Locale source, verified by grep: `expire-platform-subscriptions` hardcodes `'en-US'` date formatting and English templates, so there is no locale mechanism to inherit there; the only per-tenant language signal usable outside a request is `tenant_settings.daily_digest` (`setting_key = 'daily_digest'`, `.locale` via `resolveDigestSettings`), used by `resolveTenantLocale()` in `app/api/cron/expire-payment-requests/route.ts` (a private function there; extract it to `lib/` and reuse). Fallback `en`. Render money/dates with that locale (not `en-US`). A unit test asserts en/es key parity for the namespace.
- **Loading:** balance card renders a skeleton (fixed height, no layout shift) while the ledger query runs; banner renders nothing until standing is known (never flashes a wrong state).
- **Error:** ledger/standing query failure shows an inline "could not load your balance, retry" in the card and NO banner (fail open, consistent with the pre-check); pay-now failure shows a toast with the localized error and leaves the button re-enabled; a settle mismatch (7) shows "payment under review" rather than a credit. Email send failure is swallowed and logged (never aborts a transition) and the stamp is not set, so the next run retries.
- **Empty:** zero balance shows "nothing owed", no banner.
- Super admin: extend `platform/billing-health` with counts by state and last cron run; manual "mark paid"/"waive" actions (waive = payment row `provider='waiver'`, `recorded_by`, note — keeps ledger append-only).

## 5. Risks and mitigations

| Id | Risk | Mitigation |
|----|------|------------|
| R1 | Cron bug blocks paying schools | Stateless re-derivation, kill switch `notify_only` default, dryRun, per-run block cap, min blocking balance, Playwright lifecycle spec. |
| R2 | Block revokes student access | Gate on INSERT only; contract test on `has_course_access`; lifecycle spec asserts an enrolled student still opens a course while blocked. |
| R3 | Trigger blocks provider-driven renewals or webhooks | Exact exemption 4.2a (row-based, no caller flags, includes the in-flight first-invoice case); trigger scoped to INSERT; specs that Stripe, crypto and manual renewals still land. Needs careful review of every `transactions` insert site (admin client list). |
| R4 | Double count: platform already took fee in flight (Stripe Connect, PayPal, Solana) | Eligibility is `NOT bearsPlatformFee` AND #927 snapshot. Unit test enumerates all providers in `PROVIDER_CAPABILITIES` and asserts the eligible set. |
| R5 | Refund after fee paid | Net of refunds; carry-forward; `overpaid` reported; no clawback (same as `payouts-owed`). |
| R6 | Float residue / permanent $0.00 balance | `roundMoney` per row; `MONEY_EPSILON` compare; payments NUMERIC(10,2). |
| R7 | Amount tampering | Server derives pay-now amount; payment amount/currency mismatch not credited. |
| R8 | Double scheduling | pg_cron primary + GH fallback is documented; all phases idempotent (unique statement key, stamps). |
| R9 | Multi-currency | Hyperinflation currencies converted to USD at sale time with a frozen rate (no later re-conversion); other currencies per-currency balances, never summed; block if ANY bucket over threshold; automated rails USD only; others via manual rail. |
| R13 | Wrong or stale FX rate at insert | Rate and source stored on the row; stale fallback flagged (`:stale`); rate source change never alters history; unit test on rounding and partial-refund conversion at the stored rate. |
| R10 | Time zone / month-end ambiguity | UTC everywhere; statement `period_*` stored as dates; documented in UI. |
| R11 | Migration touches `transactions` trigger (hot table) | Trigger is one PK lookup; ship behind `notify_only` so the function returns false until `enforce`. |
| R12 | Typecheck OOM locally | Verify wave-2 with scoped `tsc` per #926 notes; regenerate `lib/database.types.ts` via `npm run db:types`. |

## 6. Test plan

Unit (`tests/unit/`):
- `platform-fee-owed.test.ts`: per-row rounding, `.99` prices at odd splits (no residue), partial refund, full refund, snapshot vs current split, legacy NULL snapshot fallback, per-currency grouping, VES to USD snapshot (stored rate, partial refund at the stored rate, no re-conversion), overpayment carry-forward, EPS threshold, provider eligibility matrix over `PROVIDER_CAPABILITIES`.
- `enforce-platform-fees.test.ts` (shape of `expire-platform-subscriptions.test.ts`): each phase status-gated and idempotent on re-run, email failure swallowed, dryRun writes nothing, `notify_only` never sets `blocked_at`, block cap, 401 without bearer.
- `sales-block-error.test.ts`; contract test for `has_course_access` not referencing fee standing; contract test that every `transactions` insert site calls `assertSalesOpen` (like `plan-feature-gate-contract.test.ts`).

Playwright `platform-fee-lifecycle.spec.ts` (needs its OWN dedicated tenant, created with the helpers in `tests/playwright/utils/plan-gate-fixtures.ts` plus a hidden `platform_plans` row, because standing is per-tenant state and the spec backdates transactions and flips `tenant_fee_standing`; never move the seeded tenants; set `platform_fee_config.enforcement_mode` per test and restore `notify_only` in teardown; `--workers=1`; `lvh.me`):
1. Seed fee-bearing manual transactions (backdate `transaction_date`, set `school_percentage_snapshot`; include one VES row with stored rate) => balance card shows expected USD figure.
2. Run cron after month boundary (backdate rows, since the route has no clock param) => statement exists; admin sees due date.
3. Advance stamps past due+grace => cron blocks; new student checkout and free enroll refused with `LM003`/friendly page; **a student with a live entitlement still opens their course**; an in-flight pending manual request confirmed by the admin still enrolls; a student's renewal of a held subscription (native, crypto, manual) still lands (4.2a).
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
6. Statement page + route branch (non-fiscal, 2.5); FX rate table + insert-time snapshot columns belong with step 2.
7. Admin balance card + banner; super-admin actions.
8. Playwright lifecycle spec; flip to `enforce` after one dry-run cycle in prod.

## 8. Owner decisions

Numbering follows the owner's answers (it differs from the earlier open-question list).

1. **Q1 Refunds: decided.** Fees are netted against refunds (`netOfRefunds()`), as the code does for every money sum (#547). Differs from Guaybo, where commissions are non-reversible. See D3, 2.1.
2. **Q2 Currency: decided, design changed.** Hyperinflation currencies (config list in `platform_fee_config`, VES initially) are converted to USD at sale time; the transaction stores rate, rate source/date and `usd_amount` at insert and the ledger tracks that USD amount; never re-converted later. Rate source proposal: BCV official for VES (as Guaybo); parallel rate flagged as the alternative, owner to confirm. All other currencies accrue per currency and are never summed across currencies. See D6, 2.1, 2.2, 2.3, 2.5, R13, and #928 below.
3. **Q3 Renewals while blocked: decided.** Students of a blocked school can still renew subscriptions they hold, on every rail. This supersedes the earlier "crypto/manual renewals are blocked" position; the exact rule is 4.2a and D9. New purchases, lapsed or canceled subscriptions and plans never held stay blocked.
4. **Q4 Grace: decided.** 7 days after the due date (`FEE_GRACE_DAYS = 7`). Minimum blocking balance stays at the proposed default 1.00 (not asked, default).
5. **Q5 Legal/invoicing: decided.** v1 is a non-fiscal monthly statement; fiscal invoices later (2.5), needing platform legal name and tax id, sequential numbering, school tax id and local IVA/VAT. Accountant confirmation recommended per country.
6. **Q6 Lemon Squeezy and PayPal: decided.** Left out of pay-now v1 (2.4).
7. **Q7 Ledger key: decided (picked by design).** `transactions.payment_provider` slug (D10).
8. **Q8 Rollout: default, owner did not answer.** Ship in `notify_only`, switch to `enforce` after one real billing cycle (3, safety rails).

Carried defaults (not asked, still recommended): pay-now allows partial/daily payments (matches Guaybo); dormant tenants with a long-unpaid balance and no sales get notices and super-admin tooling only, no automatic collection or deletion.

### Interplay with #928 (earnings page)

- #928's read-only balance must use the same USD snapshot for hyperinflation currencies (`usd_amount`, stored rate) rather than the sale-currency amount, or its figures will not reconcile with the ledger once `platform-fee-owed.ts` lands.
- Other currencies show as separate per-currency lines, never as one total.
- Show the rate and source used per converted sale (or per statement line) so the school can reconcile against its own bank in VES.
- Partial refunds in a converted currency are converted at the sale's stored rate in both places.
