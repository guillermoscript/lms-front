# Payments & billing invariants

> Moved verbatim from CLAUDE.md (index refactor). Loaded on demand — CLAUDE.md links here.

### Payment Architecture

Two separate Stripe integrations:

| | School Billing (Platform) | Student Payments (Connect) |
|--|--|--|
| **Who pays** | School admin pays platform | Student pays school |
| **Stripe mode** | Billing (Checkout + Subscriptions) | Connect (PaymentIntents) |
| **Webhook** | `/api/billing/webhook/stripe` | `/api/stripe/webhook` |
| **Env var** | `STRIPE_PLATFORM_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET` |
| **Customer ID** | `tenants.stripe_customer_id` | `profiles.stripe_customer_id` |

Student payments have two flows, both produce a `transaction` and call `enroll_user()` RPC on success:
- **Stripe Connect:** `app/api/stripe/create-payment-intent/route.ts` sets `application_fee_amount` (platform fee) + `transfer_data.destination` (school's account); revenue split in `revenue_splits` (default 20% platform / 80% school)
- **Manual/offline:** student creates a `payment_requests` row (`app/actions/payment-requests.ts`) → admin confirms receipt → `enroll_user()` RPC

Also supported (`products.payment_provider`): `paypal`, `lemonsqueezy`, `solana`, `solana_subs`, `binance` — see `docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md`.

**School billing is not Stripe-only either.** `POST /api/billing/checkout` runs on whichever provider has an active `platform_plan_prices` row and carries `supportsPlatformBillingCheckout` — Stripe, Lemon Squeezy, Binance Pay and Solana (#610). Two things follow that no Stripe-shaped code expects:
- **The crypto rails have no subscription object.** One payment buys one period, `dispatchPlatformBillingEvent` derives `current_period_end` from the interval (`selfManagedPeriod`), and `/api/cron/expire-platform-subscriptions` reminds/graces/downgrades every rail with `selfManagedPeriod`, not just `manual`. A second checkout on the same crypto rail is a *renewal* and must not be blocked or supersede anything.
- **Solana has no webhook and no redirect.** `/api/billing/webhook/solana` 404s by design; the QR page polls `/api/billing/solana/verify`, which proves the transfer on chain and dispatches through the same function the webhooks use. The pending intent is a `platform_payment_requests` row (`provider_reference` → the wallet-facing `/api/billing/solana/tx`, `provider_charge_id` UNIQUE → one signature settles one request).

**Key invariants:**
- Transaction `status`: `pending`, `successful`, `failed`, `archived`, `canceled`, `refunded`
- **`subscriptions.cancel_at_period_end` is the ONLY signal that a cancel is scheduled** (since `20260726120000`, issue #545). `cancel_at` is nullable and purely informational — the CHECK `subscriptions_cancel_at_requires_schedule` allows it to be non-NULL only while the flag is set, so clear both together (both reactivate actions do). It shipped as `NOT NULL DEFAULT now()` with no writer setting it, which made the Solana crank cancel every subscription at its first rollover. `subscription_status` is `active`/`canceled`/`expired`/`renewed`/`past_due`; `renewed` and `past_due` both count as LIVE (parallel-subscription guards, billing UI, plan change), and cancelling must never *improve* a status
- **A refund is not all-or-nothing (since #547).** A PARTIAL refund keeps `transactions.status = 'successful'` and records the slice in `refunded_amount` (major units of the row's own currency); only a FULL refund sets `refunded_amount = amount`, flips `status` to `'refunded'` and revokes the entitlement. Every money sum must use `amount - refunded_amount` (`netOfRefunds()` in `lib/payments/payouts-owed.ts`). `NormalizedBillingEvent.amount` is always MAJOR units, converted in each provider's own mapper (Lemon Squeezy reports cents, Binance a USD-pegged stablecoin); an absent amount or a currency mismatch falls back to a full refund
- **Whether the platform takes a fee is `ProviderCapabilities.bearsPlatformFee`, never `revenue_splits.applies_to_providers`** (retired in #547 — it stored the labels `stripe`/`manual`, not provider slugs, so every PayPal/LS/Binance sale bore 0% on the school's screens while `getPayoutsOwed` applied the full split). The *rate* always comes from the transaction's own `school_percentage_snapshot`, so the school-facing and platform-facing figures reconcile. `transactions` has **no `created_at`** — it is `transaction_date`; querying or merely ordering by the former 42703s the whole request
- **Access control lives in `entitlements`, not `enrollments`** (since migration `20260516150000`): `entitlements` (`user_id`, `course_id`, `tenant_id`, `source_type`, `source_id`, `status`, `expires_at`) is the polymorphic source of truth for product/subscription access. `enrollments.product_id`/`subscription_id` and their old CHECK constraint were dropped — `enrollments` is now a learning-progress record only (`user_id`, `course_id`, `status`, `tenant_id`, `enrollment_date`)
- `enroll_user()` RPC loops through ALL courses for a product (a product can map to multiple courses via `product_courses`) and writes to `entitlements`
- **Subscriptions grant access, not auto-enrollment** — students self-enroll via `/dashboard/student/browse` (`useEnrollment()` hook); `plan_courses` defines which courses a plan covers
- Transactions have two partial unique indexes (not one): `(user_id, product_id) WHERE plan_id IS NULL AND status IN ('pending','successful')` and `(user_id, plan_id) WHERE product_id IS NULL AND status = 'pending'` (pending only since #754 — a plan is bought again every period, so settled plan rows repeat; never archive old sales to make room), plus `transactions_provider_charge_id_unique` for Solana idempotency
- **`transactions` is server-write-only.** `authenticated` has no INSERT grant (#538) and an UPDATE grant on only `status`, `provider_subscription_id`, `stripe_payment_intent_id` (#528) — every insert uses `createAdminClient()` or a SECURITY DEFINER function. `amount` and the `settlement_*` columns decide what the buyer owes (`settlement_base` is what the on-chain Solana payment is verified against), so they are derived from `products`/`plans` server-side, never taken from the request. A user-scoped insert fails with `permission denied for table transactions` — by design, not a bug to re-grant around

