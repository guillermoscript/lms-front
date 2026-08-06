/**
 * Shared plumbing for the school → platform billing loop (#600 / #603).
 *
 * The student → school loop resolves its provider from the row being bought
 * (`plans.payment_provider`). Platform billing has no equivalent single column:
 * a plan can carry a price on several providers at once (`platform_plan_prices`,
 * #601), so *which* one a checkout uses is a decision, and it is made here so
 * the route and the webhook dispatcher agree on it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPaymentProvider } from '@/lib/payments'
import {
  PROVIDER_CAPABILITIES,
  type IPaymentProvider,
  type PaymentProvider,
} from '@/lib/payments/types'
import type { PlanPriceInterval } from '@/lib/billing/plan-prices'

/**
 * Providers exposed on `POST /api/billing/webhook/[provider]`.
 *
 * Same reasoning as the student route's `SUPPORTED` list: a provider with no
 * signed webhook must never get an endpoint, because that endpoint would be an
 * unauthenticated way to activate a subscription. The list is narrower than the
 * student one — `binance` is a student-side rail and has no platform price
 * rows, and `manual` settles through `platform_payment_requests` under a
 * super-admin's eye, not through a webhook.
 */
export const PLATFORM_WEBHOOK_PROVIDERS: PaymentProvider[] = ['stripe', 'lemonsqueezy', 'paypal']

/**
 * `webhook_events.provider` namespace for a platform-billing delivery.
 *
 * Platform billing may be registered for the SAME provider event types as the
 * student loop on the SAME provider account, so a single provider event id can
 * legitimately arrive at both endpoints. Sharing one key space would let
 * whichever route ran first mark the event processed and make the other one
 * skip work it had not done. Namespacing keeps the two idempotency ledgers
 * independent, which is what the old route's `'stripe_platform'` value did
 * before it was generalised.
 */
export function platformWebhookNamespace(provider: string): string {
  return `platform:${provider}`
}

/**
 * The signing secret a platform-billing webhook is verified against.
 *
 * Only Stripe currently has a second registration (the Connect endpoint owns
 * `STRIPE_WEBHOOK_SECRET`); every other provider signs both loops with the one
 * secret its own factory branch already reads, so `undefined` means "use the
 * provider's default".
 */
function platformWebhookSecret(provider: PaymentProvider): string | undefined {
  if (provider === 'stripe') return process.env.STRIPE_PLATFORM_WEBHOOK_SECRET
  return undefined
}

/**
 * A provider instance configured for the PLATFORM billing endpoint rather than
 * the student one. Throws exactly like `getPaymentProvider` when credentials
 * are missing.
 */
export function getPlatformBillingProvider(provider: PaymentProvider): IPaymentProvider {
  return getPaymentProvider(provider, { webhookSecret: platformWebhookSecret(provider) })
}

export interface PlatformPriceRow {
  paymentProvider: string
  interval: PlanPriceInterval
  providerPriceId: string
  currency: string
  amount: number | null
}

/** Every active price row for a plan, across providers and intervals. */
export async function getActivePlanPrices(
  admin: SupabaseClient,
  planId: string,
): Promise<PlatformPriceRow[]> {
  const { data } = await admin
    .from('platform_plan_prices')
    .select('payment_provider, interval, provider_price_id, currency, amount')
    .eq('plan_id', planId)
    .eq('is_active', true)

  return (data ?? []).map((row) => ({
    paymentProvider: row.payment_provider as string,
    interval: row.interval as PlanPriceInterval,
    providerPriceId: row.provider_price_id as string,
    currency: row.currency as string,
    amount: row.amount === null ? null : Number(row.amount),
  }))
}

export interface ProviderResolution {
  provider: PaymentProvider
  price: PlatformPriceRow
}

export type ProviderResolutionError =
  | { kind: 'no_prices'; providers: [] }
  | { kind: 'provider_unpriced'; requested: string; providers: string[] }
  | { kind: 'ambiguous'; providers: string[] }
  | { kind: 'unsupported'; requested: string }

/**
 * Decide which provider a checkout runs through, given the plan's active price
 * rows for the requested interval.
 *
 * Precedence, most explicit first:
 *   1. what the caller asked for;
 *   2. the provider the tenant's existing platform subscription already uses —
 *      renewing on a different rail than the one already on file is a surprise,
 *      not a default;
 *   3. the only priced provider, when there is exactly one.
 *
 * Anything else is an error the caller must surface with the real options in
 * it. The old route had a single catch-all string ("Stripe price not configured
 * for this plan. Please contact support.") which was the whole reason #602 went
 * unnoticed for months: it could not distinguish "we take no cards at all" from
 * "we take cards, just not yearly".
 */
export function resolveCheckoutProvider(
  prices: PlatformPriceRow[],
  interval: PlanPriceInterval,
  opts: { requested?: string; tenantProvider?: string | null } = {},
): { ok: true; value: ProviderResolution } | { ok: false; error: ProviderResolutionError } {
  const forInterval = prices.filter((p) => p.interval === interval)
  const available = [...new Set(forInterval.map((p) => p.paymentProvider))].sort()

  if (opts.requested) {
    if (!isPlatformCheckoutProvider(opts.requested)) {
      return { ok: false, error: { kind: 'unsupported', requested: opts.requested } }
    }
    const match = forInterval.find((p) => p.paymentProvider === opts.requested)
    if (!match) {
      return {
        ok: false,
        error: { kind: 'provider_unpriced', requested: opts.requested, providers: available },
      }
    }
    return { ok: true, value: { provider: opts.requested as PaymentProvider, price: match } }
  }

  if (available.length === 0) return { ok: false, error: { kind: 'no_prices', providers: [] } }

  if (opts.tenantProvider) {
    const match = forInterval.find((p) => p.paymentProvider === opts.tenantProvider)
    if (match && isPlatformCheckoutProvider(match.paymentProvider)) {
      return { ok: true, value: { provider: match.paymentProvider as PaymentProvider, price: match } }
    }
  }

  if (available.length === 1) {
    const match = forInterval.find((p) => p.paymentProvider === available[0])!
    if (!isPlatformCheckoutProvider(match.paymentProvider)) {
      return { ok: false, error: { kind: 'unsupported', requested: match.paymentProvider } }
    }
    return { ok: true, value: { provider: match.paymentProvider as PaymentProvider, price: match } }
  }

  return { ok: false, error: { kind: 'ambiguous', providers: available } }
}

/**
 * Whether a slug can run a platform-billing checkout at all — the capability,
 * never the identity. `manual` is excluded here on purpose: it settles through
 * `platform_payment_requests`, which is a different surface with its own state
 * ladder, not a checkout.
 */
export function isPlatformCheckoutProvider(slug: string): boolean {
  const caps = PROVIDER_CAPABILITIES[slug as PaymentProvider]
  return !!caps?.supportsPlatformBillingCheckout
}

/** Human-readable reason a checkout could not resolve a provider. */
export function describeResolutionError(error: ProviderResolutionError, interval: string): string {
  switch (error.kind) {
    case 'no_prices':
      return `This plan has no active price for ${interval} billing on any payment provider. A super admin can add one under Platform → Plans.`
    case 'provider_unpriced':
      return error.providers.length
        ? `This plan has no active ${interval} price for ${error.requested}. Configured providers: ${error.providers.join(', ')}.`
        : `This plan has no active ${interval} price for ${error.requested}, and none is configured for any other provider either.`
    case 'ambiguous':
      return `Several payment providers are configured for this plan (${error.providers.join(', ')}). Choose one.`
    case 'unsupported':
      return `${error.requested} cannot be used to pay for a platform plan.`
  }
}
