# `lib/payments/spike/` — provider-agnostic billing (design spike)

> **These files are not wired into any live payment flow.** They are the design
> target for issue #280. Read the full write-up first:
> [`docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md`](../../../docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md).

## What's here

| File | Purpose |
|---|---|
| `billing-contract.ts` | Proposed `IBillingProvider` — the contract every provider implements. Adds **capabilities**, **checkout sessions**, **customers**, **webhook normalization**, and **refunds** on top of today's `IPaymentProvider`. |
| `lemonsqueezy-provider.ts` | Reference stub #1 — a **push-renewal, Merchant-of-Record** provider (native subscriptions, hosted redirect checkout, HMAC webhooks). |
| `solana-provider.ts` | Reference stub #2 — a **self-managed-period** crypto provider (one-time Solana Pay, QR checkout, on-chain confirmation, cron-driven expiry). |

These two stubs were chosen because they sit at opposite ends of the capability
spectrum. If one contract serves both, it serves the providers in between
(PayPal, MercadoPago, Paddle, cash/bank transfer, Helio).

## Why these two prove the design

| | Lemon Squeezy | Solana Pay |
|---|---|---|
| Native recurring? | ✅ provider charges on schedule | ❌ one-time only |
| Renewal webhooks? | ✅ → never cron-expire | ❌ → we own the period, cron expires |
| Checkout kind | `redirect` (hosted URL) | `qr` (Solana Pay URL) |
| Tax | ✅ Merchant of Record | n/a |
| Refunds | programmatic | manual / out of band |

The app branches on `provider.capabilities.*`, **never** on `provider === '...'`.

## Adding a real provider (the payoff)

A new provider should be ~one PR. See §8 of the spike doc for the full checklist; in short:

1. Add `lib/payments/<name>-provider.ts` implementing `IBillingProvider`.
2. Add a `case` to `getPaymentProvider()` in `lib/payments/index.ts` (reads its env vars).
3. Add the slug to the `PaymentProvider` union (`lib/payments/types.ts`) and the DB
   `payment_provider` CHECK (one-line migration).
4. Document env keys in `.env.example`.
5. Add a normalization unit test (sample webhook payload → expected `NormalizedBillingEvent`) —
   highest value, needs no live credentials.

Nothing about the webhook route, the subscription state machine, or the entitlement
checks needs to change — that's the whole point.
