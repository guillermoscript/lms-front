# Handoff — PayPal + manual audit (2026-09-14)

Point-in-time handoff. What the two rails now prove on their own, what only a sandbox run can prove, and the one bug the audit found. Continues the work of #740 (per-rail adapter tests) and #741 (Lemon Squeezy + Binance-personal end-to-end).

Scope is the **four money combinations**:

| # | Combination | Who pays whom | Settlement surface |
|---|---|---|---|
| 1 | manual — student → school | student pays the school offline | `payment_requests` → admin confirms → `completeAndEnroll` → `transactions` → `enroll_user` |
| 2 | manual — school → platform | school wires the platform | `platform_payment_requests` → super admin confirms → `confirm_platform_payment` RPC |
| 3 | PayPal — student → school | student pays the school | `/api/payments/paypal/capture` (buyer's return) **and** `/api/payments/webhook/paypal` (backstop) |
| 4 | PayPal — school → platform | school pays the platform | **does not exist** — `supportsPlatformBillingCheckout: false` |

## State per combination

| # | Automated now | Gap that only a sandbox proves |
|---|---|---|
| 1 | `tests/playwright/manual-sale-settlement.spec.ts` (6) — **new** | nothing on this rail is provider-dependent; the gap is UX, not settlement |
| 2 | `tests/playwright/platform-billing-manual-lifecycle.spec.ts` (9, pre-existing) + `manual-payment-confirmation-rpc.spec.ts` (2) | same |
| 3 | `tests/playwright/paypal-settlement.spec.ts` (9) — **new** — plus `payment-webhook-adapters.test.ts` and `expire-stale-checkouts.test.ts` | that PayPal's LIVE payload and a REAL transmission signature match our fixtures |
| 4 | `tests/unit/platform-webhook-loop-isolation.test.ts` (8) — **new** — plus `platform-checkout-availability.test.ts` ("does not count a PayPal-only price as purchasable") | nothing — the combination is not implemented; see "Open decisions" |

Everything green as of 2026-09-14: 1214 unit tests, and the 15 new E2E cases plus the 18 neighbouring platform-billing/Lemon-Squeezy ones re-run together.

### 1 — manual, student → school (new)

`tests/playwright/manual-sale-settlement.spec.ts` drives the whole ladder through the real pages and the real server actions on its own tenant (`qa-manual-sale`), with the service-role client used **only** to seed and to read back:

student submits `/checkout/manual` → admin Sends instructions → Confirms payment received → Completes & Enrols → `transactions` row → `enroll_user` → `entitlements` + `enrollments`.

What it pins beyond "it worked":

- **The price is server-derived.** The student's form posts a phone number and a message. `payment_amount` must come from `products`, and `completeAndEnroll` copies it onto the transaction — the browser never names a price.
- **The identity is server-derived** (session email + profile name, client values are fallback only).
- **A $0 product is refused** (#727) — a free offering is a `manual` product at price 0, so without that guard every giveaway becomes an unpayable bill in the admin queue.
- **"I saw the money" and "you may enter" stay two events** — `confirmPaymentReceived` grants nothing; a school that confirms a transfer which later bounces has not yet given the course away.
- **The tenant filter holds**: another school's admin (a real admin, deliberately not the super admin) is bounced off the request detail page.

Why it was needed: `enrollment-flows.spec.ts` walks the same lifecycle by **writing the rows itself** ("simulating the server action") and asserting that pages render. A `payment_requests` row written by a test is not evidence that the action which should have written it works, and nothing had ever fired `after_transaction_insert` → `enroll_user` on this rail.

### 3 — PayPal, student → school (new)

`tests/playwright/paypal-settlement.spec.ts`, over real HTTP against the real database, covering **both entrances** — the buyer's return (which is what actually takes the money; Orders v2 does not auto-capture) and the webhook backstop:

- an event PayPal refuses to verify → 400, no ledger row, transaction stays pending;
- an event missing a transmission header → 400 **without a PayPal round trip** (an unsigned POST must not spend our API quota);
- a verified `PAYMENT.CAPTURE.COMPLETED` → settles, flips `payment_provider`, grants every course the product maps to, and the verify envelope we send PayPal carries all five headers + the webhook id;
- a redelivery → acked duplicate, `attempt_count` still 1, one settled row;
- a `custom_id` naming a different buyer → 500 and nothing settled (owner binding fails closed);
- a partial `PAYMENT.CAPTURE.REFUNDED` → slice recorded in major units, sale and access survive;
- the return route → captures, settles, redirects to the same-origin `next`; a refresh (`ORDER_ALREADY_CAPTURED`) recovers through `getOrder` and settles nothing twice; a cross-origin `next` falls back to our own success page.

**The seam.** PayPal's signature cannot be produced by us — `verifyWebhook` asks PayPal's verify API and believes the answer — so the spec stubs PayPal's host. `PAYPAL_API_BASE` overrides it, is read per call, and is **ignored unless loopback**: the first request it receives is `POST /v1/oauth2/token` carrying Basic auth over `PAYPAL_CLIENT_ID:PAYPAL_CLIENT_SECRET`, the platform's own merchant credential. Same shape and same reasoning as `BINANCE_PAY_API_BASE` (#741). It must never be set on a deployed environment.

To run locally: put `PAYPAL_API_BASE=http://127.0.0.1:3098` in `.env.local` **and restart the dev server** (Playwright reuses a server already listening and cannot hand it an env var after the fact). CI sets it on the `e2e` job alongside synthetic `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID`; drop any of them and the spec skips, which `check-e2e-skips.mjs` turns into a job failure.

## The bug this audit found (fixed here)

**A student's course purchase could rewrite the school's own platform subscription.**

`dispatchPlatformBillingEvent` had no list of event types it models. `STATUS_BY_TYPE[event.type] ?? 'active'` meant `payment.succeeded`, `payment.failed` and `refund.succeeded` — the student loop's vocabulary — were treated as activations.

Why they can arrive there at all: Stripe is the only rail with a second signing secret (`STRIPE_PLATFORM_WEBHOOK_SECRET`), so a student event posted to `/api/billing/webhook/stripe` fails verification. **PayPal, Binance Pay and Lemon Squeezy sign both loops with one secret, from one merchant account, under one webhook registration.** Register the platform endpoint for one of them — which #610 tells operators to do for Binance, and which the PayPal endpoint invites by existing — and it receives every student's course purchase, correctly signed.

What happened then: `resolveTenantId` reads `metadata.tenant_id ?? metadata.tenantId`, and the student checkout puts exactly `tenantId` in provider metadata, so the event resolved the **buyer's school**. The identity guard below it is skipped when the stored row has no `provider_subscription_id` — the shape of every bank-transfer subscription. A $5 course sale then wrote `status: 'active'`, flipped `payment_provider` to the student rail, and cleared `grace_period_end` and `renewal_reminder_sent_at`. On a lapsed school that is a free plan forever: `expire-platform-subscriptions` only walks `PLATFORM_SELF_MANAGED_PROVIDERS`, and `paypal` is not one, so nothing would expire the row again.

Fix: `STUDENT_LOOP_EVENT_TYPES` in `lib/billing/platform-webhook-dispatch.ts` — ack and drop, never throw (the delivery is legitimate, it just belongs to the other loop). Platform activation arrives as `subscription.activated` on every rail; Binance's adapter branches on `planId` to say so.

Covered by `tests/unit/platform-webhook-loop-isolation.test.ts`, which fails on all three rails without the guard (verified by reverting it), and which also asserts that a genuine platform activation on the same PayPal account still lands — so the fix is not a leak turned into an outage.

## Open decisions (yours, not shipped)

1. **`PLATFORM_WEBHOOK_PROVIDERS` lists `paypal`, which can never run a platform checkout** (`supportsPlatformBillingCheckout: false`). Every event that endpoint receives for PayPal today is, by construction, from the other loop. Dropping it from the list closes the door entirely; keeping it is the right call only if combination 4 is coming. Left as-is and pinned by a test that fails when either half changes, so the decision gets made deliberately.
2. **A manual sale writes `payment_provider = NULL`.** `completeAndEnroll` never sets it and the column has no default. Nothing breaks today because every reader goes through `resolveProvider()`, which coalesces "no provider, no Stripe intent" to `manual` — the same coalesce `get_platform_revenue` does in SQL. Any future reader that filters on the column directly silently drops every offline sale. The spec asserts the NULL so the assumption is visible.
3. **`/checkout/manual` still renders a payment form for a $0 product.** The refusal is `createPaymentRequest`'s, i.e. after the student has filled the form and pressed the button. The product page already offers one-click enrolment; the page should route there instead of failing at submit.

## What is still on you — the sandbox matrix

The specs prove the code. They deliberately do not prove that PayPal's live payload and a real transmission signature match the fixtures, nor that a real bank wire round-trips through a real school's queue. That is the four-way manual run.

| # | Combination | Verdict | Notes |
|---|---|---|---|
| 1 | manual, student → school | _pending_ | |
| 2 | manual, school → platform | _pending_ | |
| 3 | PayPal, student → school | _pending_ | sandbox creds are in `.env.local`; `PAYPAL_WEBHOOK_ID` must match the registration that delivers to `/api/payments/webhook/paypal` |
| 4 | PayPal, school → platform | _pending_ | expected: not offered at all — see Open decisions #1 |

Fill the verdict column in; anything that comes back red gets a spec here before a fix, the way the loop-isolation bug did.

## Files

| Path | What |
|---|---|
| `tests/playwright/paypal-settlement.spec.ts` | new — combination 3, both entrances |
| `tests/playwright/manual-sale-settlement.spec.ts` | new — combination 1, through the real UI and actions |
| `tests/unit/platform-webhook-loop-isolation.test.ts` | new — the cross-loop bug, all three shared-secret rails |
| `lib/billing/platform-webhook-dispatch.ts` | fix — `STUDENT_LOOP_EVENT_TYPES` |
| `lib/payments/paypal-provider.ts` | `PAYPAL_API_BASE` loopback-only test seam |
| `components/admin/payment-request-actions.tsx`, `components/student/payment-request-form.tsx` | `data-testid` on the six controls the manual ladder is driven by |
| `.env.example`, `playwright.config.ts`, `.github/workflows/ci.yml` | the seam's wiring, and `qa-manual-sale.lvh.me` in CI's hosts |
