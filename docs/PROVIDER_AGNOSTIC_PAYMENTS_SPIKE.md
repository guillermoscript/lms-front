# Spike: Provider-Agnostic Payments & Subscriptions

> **Status:** Design spike (no live code paths changed). Companion to issue #280 and PR #330.
> **Author:** generated 2026-06-15.
> **Reference stubs:** `lib/payments/spike/` (proposed contract + Lemon Squeezy + Solana adapters).

## TL;DR

We are **not** trying to support every payment processor ourselves. We are designing a
**thin, well-documented contract** so that:

1. A school admin can pick *which* provider a plan/product is sold through (Stripe, PayPal,
   Lemon Squeezy, MercadoPago, crypto, cash/bank transfer…), per product.
2. Adding a brand-new provider is a **single adapter file + one webhook normalizer + one
   factory line** — a contained PR that a contributor (or a future us) can submit without
   rewriting the checkout, the subscription model, or the entitlement logic.
3. The **subscription/entitlement model works identically** whether the provider pushes
   renewal events (Stripe/Lemon Squeezy/Paddle/MercadoPago) or requires us to manage the
   billing period ourselves (cash, bank transfer, most crypto).

The key architectural move is **decoupling entitlements from billing**: our database is the
source of truth for "can this user access this course right now," and providers only feed
*events* into that model. This is already 80% true in the codebase — products are fully
abstracted, and PR #330 extended the abstraction to the plan/subscription *lookup & cancel*
layer. This spike defines the rest: a **checkout-session abstraction**, a **unified webhook
ingestion layer**, **provider capability flags**, and a **self-managed billing-period** path
for providers without native recurring billing.

---

## 1. Goals & non-goals

### Goals
- One interface (`IBillingProvider`) that any provider implements. No `import Stripe` outside
  `stripe-provider.ts`.
- Per-product / per-plan provider selection (already exists for products; extend confidence to plans).
- A subscription lifecycle that is **identical across providers** at the DB/entitlement level.
- A **contributor on-ramp**: documented "how to add a provider" with a checklist and two worked
  reference stubs (Lemon Squeezy = native recurring + Merchant-of-Record; Solana = one-time +
  self-managed period).
- LATAM-first: make local methods (MercadoPago, PIX/OXXO/Boleto, bank transfer, crypto) first-class.

### Non-goals (for this spike)
- Building production integrations for every provider. We ship **stubs + the contract**; the
  community/we fill them in later.
- A payment-orchestration *router* (auto-failover between providers, smart routing by BIN/geo).
  That's a possible future layer (see §11) but out of scope.
- Changing platform/tenant billing (`platform_subscriptions`, Stripe Connect). That is a separate
  Stripe-Billing concern and stays as-is.

---

## 2. Current state (what's already agnostic vs coupled)

The product payment system is a good template; plans/subscriptions are mid-migration.

| Concern | File | State |
|---|---|---|
| Provider factory | `lib/payments/index.ts` | ✅ `getPaymentProvider()` switch; `binance` throws, `paypal` is a stub |
| `IPaymentProvider` contract | `lib/payments/types.ts` | ✅ products/prices; ⚠️ subscriptions are *optional* methods only; ❌ no checkout-session / customer / webhook / refund concepts |
| Stripe adapter | `lib/payments/stripe-provider.ts` | ✅ full products/prices + subscription create/cancel/get |
| Manual adapter | `lib/payments/manual-provider.ts` | ✅ DB-only no-ops (correct for offline) |
| PayPal adapter | `lib/payments/paypal-provider.ts` | ⚠️ placeholder — every method `console.log` + TODO |
| Product CRUD | `app/actions/admin/products.ts` | ✅ fully via `getPaymentProvider()` + `provider_product_id/price_id` |
| Plan CRUD | `app/actions/admin/plans.ts` | ✅ refactored onto the provider pattern (PR #330) |
| Subscription cancel | `app/actions/admin/subscriptions.ts` | ✅ provider-aware (PR #330) |
| Stripe webhook | `app/api/stripe/webhook/route.ts` | ⚠️ lookup fixed to `provider_subscription_id` (PR #330), but still a **Stripe-only file**; routes by Stripe event strings |
| Manual / offline | `app/actions/payment-requests.ts` | ✅ provider-agnostic for products *and* plans |
| Checkout (student) | `app/[locale]/(public)/checkout/*` | ⚠️ card tab = Stripe PaymentElement only (the `mock_test` action was removed); offline tab = payment request. No generic "provider checkout session" |
| Enrollment / access | `enroll_user` / `handle_new_subscription` RPC + `entitlements` | ✅ single path for all providers (transaction insert → trigger → RPC) |

### The real coupling points still left

1. **No checkout-session abstraction.** A student "subscribing" today just inserts a
   `transactions` row with `status='successful'`, and a DB trigger calls
   `handle_new_subscription`. There is **no call to any provider's "start a subscription"** —
   `provider_subscription_id` is never populated by the create flow, so renewal webhooks have
   nothing to match (PR #330 fixed the *lookup*, but nothing *writes* the id yet). This is the
   single biggest gap.
2. **`profiles.stripe_customer_id`** is a Stripe-named column read by `subscriptions.ts` and the
   webhook. Should be provider-scoped.
3. **The webhook file is Stripe-shaped.** Event routing, signature verification, and DB writes
   all live in one Stripe-specific handler. There is no per-provider signature verification or
   event normalization.
4. **Refunds are Stripe-only** (`charge.refunded`). No abstract refund concept.
5. **Subscription expiry cron** treats everything as time-based; it doesn't know that
   push-renewal providers should *not* be expired by cron (only by their webhook).

---

## 3. Research summary (what others do)

Full notes with source URLs in §12. Condensed conclusions:

### 3.1 The pattern everyone converges on
- **Adapter/strategy per provider** behind one interface + a **factory** that selects by config.
  (Exactly what the codebase already does for products.)
- **Decouple entitlements from billing.** Three layers: *entitlements* (what the user can access
  now) ← *billing rules* (when/how to charge) ← *payment rail* (the provider moving money). The
  app only ever queries entitlements. This is the load-bearing idea for supporting providers with
  wildly different capabilities.
- Open-source prior art: **Hyperswitch** (payment orchestration, 300+ PSPs, self-hostable),
  **Lago** (open-source billing + entitlements). We don't need to adopt these, but they validate
  the layering.

### 3.2 Provider landscape relevant to a LATAM LMS

| Provider | Recurring model | LATAM fit | Tax / MoR | Notes |
|---|---|---|---|---|
| **Stripe** | Native subscriptions + webhooks | Weak in several LATAM countries; high intl-card declines | No (you handle tax) | Already integrated |
| **Lemon Squeezy** | Native subscriptions + webhooks | Card + PayPal only (no local methods) | ✅ **Merchant of Record** (handles VAT/IVA globally) | Simplest API; Stripe-owned since 2024. **Our reference "easy win".** |
| **Paddle** | Native, richer (proration/dunning/pause) | Card + Alipay; no PIX/OXXO | ✅ MoR | Heavier API; best if we outgrow LS |
| **MercadoPago** | Native via **Preapproval API** (card only) | ⭐ Dominant LATAM processor, best local card acceptance | No | PIX/OXXO are **one-time only** via preapproval |
| **Rebill** | Native, LATAM-specialized | ⭐ PIX, Boleto, OXXO, SPEI, PSE, Nequi, Yape, MP | No | Purpose-built LATAM recurring; ~20% higher acceptance claim |
| **PayPal** | Native (Billing Plans API) | OK | No | Adapter is a stub today |
| **Solana Pay** | **None** (one-time only) | Borderless | n/a | QR/URL spec; confirm on-chain via `getSignaturesForAddress`. **Our reference "self-managed period" example.** |
| **Helio / Solana native subs** | Email-reminder renewal *or* on-chain auto-pull (native program) | Borderless, USDC | n/a | Real crypto recurring; higher integration complexity |
| **Cash / bank transfer** | **None** (admin-managed) | ⭐ Universal | n/a | Already works via `payment_requests` |

### 3.3 The capability spectrum (this drives the design)

Providers fall into three buckets. The contract must serve all three with the *same*
subscription model:

1. **Push-renewal** (Stripe, Lemon Squeezy, Paddle, MercadoPago-card, PayPal): the provider
   charges on a schedule and **sends a webhook** on each renewal/failure/cancellation. We update
   `current_period_end` from the event. **Never expire these via cron.**
2. **Self-managed period** (cash, bank transfer, OXXO/Boleto, basic crypto/Solana Pay): there is
   no external recurring engine. **We** set `current_period_end` when payment is confirmed and a
   **cron job expires** the row when the period lapses. Renewal = a new payment.
3. **Hybrid crypto** (Helio / Solana native subscriptions): can be either — treat as push-renewal
   if the provider emits renewal webhooks, otherwise as self-managed.

---

## 4. Proposed contract: `IBillingProvider`

> Lives (as a spike) in `lib/payments/spike/billing-contract.ts`. The intent is to **grow the
> existing `IPaymentProvider`** into this, not replace it wholesale — all new methods are additive
> and capability-gated, so existing providers keep working.

Three additions to today's product/price/subscription interface:

### 4.1 Capability flags
A static descriptor so the app can branch *without* `if (provider === 'stripe')` checks:

```ts
interface ProviderCapabilities {
  supportsNativeSubscriptions: boolean   // provider charges on a schedule itself
  emitsRenewalWebhooks: boolean          // we get told about renewals → don't cron-expire
  supportsHostedCheckout: boolean        // provider gives us a redirect URL
  supportsRefunds: boolean
  isMerchantOfRecord: boolean            // provider handles tax (LS/Paddle)
  selfManagedPeriod: boolean             // WE extend the period on confirmed payment
}
```

### 4.2 Checkout sessions (the missing creation path)
Unify "send the student somewhere to pay" across hosted-redirect (LS, MercadoPago, PayPal),
client-confirmed (Stripe PaymentIntent), QR/URL (Solana Pay), and offline (payment request):

```ts
interface CheckoutSession {
  kind: 'redirect' | 'client_secret' | 'qr' | 'offline'
  url?: string            // redirect / QR target
  clientSecret?: string   // Stripe-style client confirmation
  reference: string       // our internal correlation id (→ transaction/payment_request)
  providerRef?: string    // provider's session/intent id
  expiresAt?: Date
}

createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>
```

### 4.3 Customer + webhook normalization + refunds
```ts
// optional — providers that need a stored customer (Stripe/MP card-on-file)
ensureCustomer?(params: EnsureCustomerParams): Promise<{ providerCustomerId: string }>

// turn a raw provider webhook into our internal event vocabulary
verifyWebhook(rawBody: string, headers: Record<string,string>): Promise<boolean>
normalizeWebhookEvent(rawBody: string): Promise<NormalizedBillingEvent | null>

// optional
refund?(params: RefundParams): Promise<void>
```

Where the **internal event vocabulary** is provider-independent:

```ts
type BillingEventType =
  | 'payment.succeeded' | 'payment.failed'
  | 'subscription.activated' | 'subscription.renewed'
  | 'subscription.past_due' | 'subscription.canceled' | 'subscription.expired'
  | 'refund.succeeded'

interface NormalizedBillingEvent {
  type: BillingEventType
  providerSubscriptionId?: string
  providerPaymentId?: string
  reference?: string          // our correlation id from metadata
  periodEnd?: Date
  raw: unknown                // keep the original for audit
}
```

This is the crux: **every provider's webhook collapses into the same handful of events**, and a
single internal handler updates `subscriptions` / `transactions` / `entitlements`.

---

## 5. Unified webhook ingestion layer

Replace the Stripe-only route with a per-provider route that shares one pipeline:

```
POST /api/payments/webhook/[provider]
  1. read RAW body (needed for HMAC)
  2. provider = getBillingProvider(params.provider)
  3. if (!await provider.verifyWebhook(raw, headers)) → 400
  4. persist raw event → webhook_events (idempotency key = (provider, provider_event_id))
  5. 200 OK immediately
  6. event = await provider.normalizeWebhookEvent(raw)
  7. dispatch(event) → ONE internal handler updates subscriptions/entitlements
```

- **Per-provider signature schemes** stay inside each adapter's `verifyWebhook` (Stripe
  `Stripe-Signature`, Lemon Squeezy `X-Signature`, MercadoPago `x-signature`, Solana = on-chain
  RPC confirmation, not HMAC).
- **Idempotency** via a new `webhook_events` table with a unique `(provider, provider_event_id)`
  and a `processed_at` guard. Critical because crypto/manual confirmation may be polled and
  retried.
- The existing `/api/stripe/webhook` route can **delegate** to this for a transition period
  (keep Stripe's URL alive, call the shared dispatcher).

---

## 6. Subscription lifecycle (identical across providers)

State machine on `subscriptions.subscription_status` regardless of provider:

```
              ┌──────────── renew ok ─────────────┐
              ▼                                    │
 (start) → active → past_due ──retry ok──→ active  │
              │  │        └──give up──→ canceled    
              │  └── cancel(at period end) ─────────┐
              │                                      ▼
              └── cancel(immediate) ───────────► canceled
   self-managed only:  active ──period lapses (cron)──► expired
```

| Event source | Who advances the state |
|---|---|
| Push-renewal providers | their webhook → `normalizeWebhookEvent` → dispatcher |
| Self-managed (cash/crypto) | payment confirmation extends `current_period_end`; **daily cron** flips lapsed rows to `expired` |

The cron must be capability-aware:

```sql
UPDATE subscriptions s
SET subscription_status = 'expired'
FROM plans p
WHERE s.plan_id = p.plan_id
  AND s.subscription_status = 'active'
  AND s.current_period_end < now()
  AND <provider for s is selfManagedPeriod>;   -- never expire push-renewal subs
```

Access checks never touch a provider — they read entitlements:
`status='active' AND current_period_end > now()` joined through `plan_courses`.

---

## 7. Data model changes needed

Building on the PR #330 migration (`payment_provider`, `provider_subscription_id`,
`provider_product_id/price_id` already added):

1. **Rename `profiles.stripe_customer_id` → `provider_customer_id`** *(plus optionally a
   `payment_provider` companion, or a small `provider_customers(user_id, provider, customer_id)`
   table since one user may have a customer id per provider)*. Recommended: the join table — a user
   can legitimately have a Stripe *and* a MercadoPago customer id.
2. **New `webhook_events` table** for idempotent ingestion + audit:
   `(id, provider, provider_event_id UNIQUE, event_type, payload jsonb, received_at, processed_at)`.
3. **`subscriptions.current_period_start`** (if missing) for cleaner reporting; `current_period_end`
   already exists.
4. **Extend the `payment_provider` CHECK / union** to include new slugs as adapters land
   (`lemonsqueezy`, `mercadopago`, `solana`, …). Today's union is
   `'stripe' | 'paypal' | 'binance' | 'manual'` in `lib/payments/types.ts`.

No destructive changes; all additive/rename-with-guard like the existing migration.

---

## 8. How to add a provider (contributor guide)

This is the payoff. Adding "Foo Pay" should be ~one PR:

1. **Adapter** — `lib/payments/foo-provider.ts` implementing `IBillingProvider`
   (declare `capabilities`; implement `createCheckoutSession`, `verifyWebhook`,
   `normalizeWebhookEvent`; products/prices/subscriptions as the provider supports — others can be
   no-ops if e.g. it's offline-like).
2. **Factory line** — add `case 'foo':` to `getPaymentProvider()` in `lib/payments/index.ts`,
   reading its env vars.
3. **Union/CHECK** — add `'foo'` to the `PaymentProvider` type and the DB `payment_provider`
   CHECK constraint (one-line migration).
4. **Env** — document keys in `.env.example`.
5. **UI** — the provider already appears in the plan/product form selector once it's in the union;
   add a label/icon.
6. **Webhook** — nothing new to wire: `/api/payments/webhook/foo` is generic; the adapter's
   `verifyWebhook` + `normalizeWebhookEvent` do the work.
7. **Tests** — a normalization unit test (sample webhook payload → expected
   `NormalizedBillingEvent`) is the highest-value test and needs no live credentials.

**Checklist for the PR template:**
- [ ] `capabilities` accurately set (esp. `emitsRenewalWebhooks` / `selfManagedPeriod`)
- [ ] `createCheckoutSession` returns the right `kind`
- [ ] `verifyWebhook` uses the **raw** body
- [ ] `normalizeWebhookEvent` maps every lifecycle event the provider sends
- [ ] No `import`/types leak the provider SDK outside the adapter
- [ ] Manual/offline fallbacks behave (no crash if optional methods absent)

---

## 9. Phased roadmap

| Phase | Scope | Risk |
|---|---|---|
| **0 — done** | PR #330: migration, webhook lookup fix, plan CRUD on provider pattern | merged-pending |
| **1 — contract** | Land `IBillingProvider` (additive to `IPaymentProvider`): capabilities + checkout-session + webhook-normalize + refund signatures. Stub adapters compile. No behavior change. | low |
| **2 — checkout session** | Wire `createCheckoutSession` into the student checkout so a real `provider_subscription_id` gets stored at creation (closes the §2.1 gap). Start with Stripe (already has `createSubscription`). | medium |
| **3 — webhook layer** | Add `webhook_events` table + `/api/payments/webhook/[provider]` + dispatcher; have the existing Stripe route delegate to it. | medium |
| **4 — first new provider** | Implement **Lemon Squeezy** end-to-end (MoR, native subs) as the proof the abstraction holds. | medium |
| **5 — LATAM** | **MercadoPago** (card recurring) and/or **Rebill** (local methods); **Solana Pay** one-time + self-managed period; capability-aware expiry cron. | higher |
| **6 — customers** | `provider_customers` join table; rename `stripe_customer_id`. | low/med |

Phases 1, 3, and the stub adapters are safe to do now without touching money flows.

---

## 10. Risks & open questions

- **Customer identity per provider.** Stripe/MP need a stored customer for card-on-file recurring;
  LS/Solana don't. The `provider_customers` join table resolves this but adds a write to checkout.
- **MoR vs Connect revenue split.** Lemon Squeezy/Paddle are Merchant-of-Record — *they* are the
  seller and remit to the school differently than Stripe Connect's `application_fee_amount`. Our
  `revenue_splits` model assumes Connect. MoR providers may need a different payout reconciliation
  (open question — likely out of scope, schools using MoR get paid by the MoR, not by us).
- **Crypto refunds are effectively manual.** `supportsRefunds=false` for Solana Pay; admin issues
  an on-chain refund out of band.
- **MercadoPago PIX/OXXO are one-time only** — they can't back a native subscription; they map to
  the **self-managed period** path (generate a new charge each cycle).
- **Per-tenant provider credentials.** Today keys are global env vars. True multi-tenant means each
  school brings its own Stripe/MP/LS keys → a `tenant_payment_credentials` table (encrypted). Big,
  separate effort; the contract doesn't block it but the factory would read tenant creds instead of
  env.

---

## 11. Optional future: orchestration layer

Once 2+ providers exist, a thin router could pick a provider by tenant config, buyer geo, or
failover (retry MercadoPago if a Stripe card declines). Hyperswitch is the open-source reference.
**Explicitly out of scope** — listed so the contract above stays compatible with it (it already is:
a router just calls `getBillingProvider()` with a chosen slug).

---

## 12. Sources

Architecture / orchestration:
- Adapter pattern for payment gateways — https://endgrate.com/blog/adapter-pattern-use-cases-payment-gateway-integration
- Abstract monetization engine (entitlements vs billing) — https://www.webdigestpro.com/architecting-an-abstract-monetization-engine-a-technical-guide-to-high-integrity-saas-billing/
- Hyperswitch (open-source orchestration) — https://hyperswitch.io/
- Lago (open-source billing + entitlements) — https://getlago.com/blog/lago-entitlements
- Recurring-payment system design — https://www.geeksforgeeks.org/system-design/system-design-pattern-for-recurring-payments/

Merchant-of-Record:
- Lemon Squeezy vs Paddle 2026 — https://thesoftwarescout.com/lemon-squeezy-vs-paddle-2026-best-payment-platform-for-saas-developers/
- Lemon Squeezy webhooks — https://docs.lemonsqueezy.com/help/webhooks/webhook-requests
- LS vs Polar vs Paddle MoR 2026 — https://www.buildmvpfast.com/blog/lemon-squeezy-vs-polar-paddle-merchant-of-record-2026

Crypto:
- Solana Pay spec — https://docs.solanapay.com/spec
- Solana native subscriptions & allowances — https://solana.com/news/subscriptions-and-allowances
- Helio subscriptions — https://www.hel.io/blog/introducing-helio-subscriptions
- NOWPayments recurring API — https://nowpayments.io/blog/recurring-payments-api
- Recurring crypto platforms 2026 — https://eco.com/support/en/articles/15232579-best-recurring-crypto-payment-platforms-2026-stablecoin-subscription-billing-compared

LATAM:
- Rebill (LATAM subscriptions) — https://www.rebill.com/en/solutions/saas-subscription-payments-latin-america
- MercadoPago subscriptions (preapproval) — https://www.mercadopago.com.co/developers/en/docs/subscriptions/integration-configuration/subscription-associated-plan
- MercadoPago subscription webhooks — https://www.mercadopago.com.co/developers/en/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
- LATAM recurring landscape (PIX/Boleto/OXXO) — https://www.ppro.com/insights/subscriptions-and-recurring-payments-the-latam-revolution/

Webhooks:
- Webhook processing at scale (idempotency/signatures/queues) — https://dev.to/whoffagents/webhook-processing-at-scale-idempotency-signature-verification-and-async-queues-45b3
- Webhook reliability 2026 — https://www.digitalapplied.com/blog/webhook-reliability-idempotency-retries-engineering-reference-2026
