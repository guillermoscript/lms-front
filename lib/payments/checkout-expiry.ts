/**
 * Local TTL for hosted-checkout redirects (issue #624).
 *
 * A hosted checkout inserts a `pending` transaction and then hands the buyer to
 * the provider. If they never come back, that row sits inside both partial
 * unique indexes (transactions_unique_product / transactions_unique_plan, which
 * cover status IN ('pending','successful')) and blocks every replacement
 * purchase of the same item. PayPal expires abandoned orders on its own side
 * with no guaranteed terminal webhook; Lemon Squeezy emits no one-time failure
 * event for this path. So the TTL has to be OURS.
 *
 * The window is gated on `supportsHostedCheckout`, never on provider name — the
 * property that creates the hazard is "we redirect away and may never hear
 * back", and that is exactly what the capability records.
 */

import { PROVIDER_CAPABILITIES, type PaymentProvider } from './types'

/**
 * Default local TTL, in minutes.
 *
 * 24h deliberately matches the definition already written down for
 * ANALYTICS_EVENTS.CHECKOUT_ABANDONED ("checkout_started with no terminal event
 * in 24h") so the funnel metric and the row's actual fate agree.
 *
 * Erring long is the safe direction: expiring early would cancel a checkout the
 * buyer is still completing, and a provider success that lands after the TTL is
 * recoverable (settle_expired_checkout revives it) while a premature expiry
 * during payment is a live buyer hitting a dead page.
 */
export const DEFAULT_CHECKOUT_TTL_MINUTES = 24 * 60

/** `CHECKOUT_TTL_MINUTES` env override, ignored unless it parses to a positive number. */
export function checkoutTtlMinutes(): number {
  const raw = Number(process.env.CHECKOUT_TTL_MINUTES)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CHECKOUT_TTL_MINUTES
}

/** Providers whose checkout is a redirect we may never hear back from. */
export function isHostedCheckoutProvider(provider: string | null | undefined): boolean {
  if (!provider) return false
  return PROVIDER_CAPABILITIES[provider as PaymentProvider]?.supportsHostedCheckout === true
}

/**
 * Providers whose abandoned checkout the stale-checkout cron may release: every
 * hosted rail, plus Stripe Elements (#754). The card route inserts its pending
 * row before the buyer sees the form and Stripe sends nothing when the tab is
 * closed, so it has the same hazard without redirecting anywhere. Stripe is
 * named, not a capability, because the cron asks the Stripe API directly
 * (lib/payments/stripe-reconcile.ts) — the property only holds for that rail.
 */
export function isExpirableCheckoutProvider(provider: string | null | undefined): boolean {
  return isHostedCheckoutProvider(provider) || provider === 'stripe'
}

/** The TTL deadline counted from `now`. */
export function checkoutExpiryFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + checkoutTtlMinutes() * 60_000).toISOString()
}

/**
 * The `checkout_expires_at` to store at creation time for the unified checkout
 * route, or null for a rail that settles in-band there (Solana Pay is polled by
 * our own verify endpoint, manual is an offline payment request). Stripe
 * Elements never goes through that route; its own route stamps
 * `checkoutExpiryFrom()` directly.
 */
export function checkoutExpiresAt(
  provider: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!isHostedCheckoutProvider(provider)) return null
  return checkoutExpiryFrom(now)
}
