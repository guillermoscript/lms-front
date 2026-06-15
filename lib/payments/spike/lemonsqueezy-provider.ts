/**
 * SPIKE STUB — Lemon Squeezy adapter (reference example #1).
 *
 * NOT wired into any live flow. Demonstrates a PUSH-RENEWAL,
 * MERCHANT-OF-RECORD provider: Lemon Squeezy is the legal seller, handles global
 * tax (incl. LATAM VAT/IVA), charges subscriptions on a schedule, and notifies us
 * via webhooks. So:
 *   - capabilities.emitsRenewalWebhooks = true  → never cron-expire its subs
 *   - capabilities.isMerchantOfRecord   = true  → tax handled for us
 *   - checkout.kind = 'redirect'                → hosted checkout URL
 *
 * Real implementation would use the Lemon Squeezy REST API (JSON:API):
 *   - createCheckoutSession → POST /v1/checkouts
 *   - subscriptions         → GET/DELETE /v1/subscriptions/{id}
 *   - webhook verify        → HMAC-SHA256 of the RAW body with the signing secret,
 *                             compared to the `X-Signature` header
 * Docs: https://docs.lemonsqueezy.com/api  ·  webhooks: https://docs.lemonsqueezy.com/help/webhooks
 *
 * To make this real (per docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md §8):
 *   1. fill these methods using the LS API
 *   2. add 'lemonsqueezy' to PaymentProvider union + DB CHECK
 *   3. add a `case 'lemonsqueezy'` to getPaymentProvider() reading LEMONSQUEEZY_API_KEY
 *   4. add LEMONSQUEEZY_API_KEY / LEMONSQUEEZY_STORE_ID / LEMONSQUEEZY_WEBHOOK_SECRET to .env.example
 */

import type {
  CreatePriceParams,
  CreateProductParams,
  CreateSubscriptionParams,
  PaymentPrice,
  PaymentProduct,
  ProviderSubscription,
  UpdatePriceParams,
  UpdateProductParams,
} from '../types'
import type {
  CheckoutSession,
  CreateCheckoutParams,
  IBillingProvider,
  NormalizedBillingEvent,
  ProviderCapabilities,
  RefundParams,
} from './billing-contract'

const todo = (method: string): never => {
  throw new Error(`[spike] LemonSqueezyProvider.${method} not implemented yet`)
}

export class LemonSqueezyProvider implements IBillingProvider {
  readonly provider = 'lemonsqueezy' as const

  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: true,
    supportsRefunds: true,
    isMerchantOfRecord: true,
    selfManagedPeriod: false,
  }

  // LS stores amounts in cents, like Stripe.
  convertAmount(amount: number, fromUnit: 'base' | 'major'): number {
    return fromUnit === 'major' ? Math.round(amount * 100) : amount
  }

  // --- Catalog: in LS these map to "products" and "variants". ---
  async createProduct(_params: CreateProductParams): Promise<PaymentProduct> {
    return todo('createProduct')
  }
  async updateProduct(_id: string, _params: UpdateProductParams): Promise<PaymentProduct> {
    return todo('updateProduct')
  }
  async getProduct(_id: string): Promise<PaymentProduct> {
    return todo('getProduct')
  }
  async archiveProduct(_id: string): Promise<void> {
    return todo('archiveProduct')
  }
  async restoreProduct(_id: string): Promise<void> {
    return todo('restoreProduct')
  }
  async createPrice(_params: CreatePriceParams): Promise<PaymentPrice> {
    return todo('createPrice')
  }
  async updatePrice(_id: string, _params: UpdatePriceParams): Promise<PaymentPrice> {
    return todo('updatePrice')
  }
  async getPrice(_id: string): Promise<PaymentPrice> {
    return todo('getPrice')
  }
  async archivePrice(_id: string): Promise<void> {
    return todo('archivePrice')
  }

  // --- Checkout: LS returns a hosted checkout URL → kind 'redirect'. ---
  async createCheckoutSession(_params: CreateCheckoutParams): Promise<CheckoutSession> {
    // Real: POST /v1/checkouts with custom_data: { reference } so it round-trips
    // on the webhook, then return { kind: 'redirect', url: data.attributes.url }.
    return todo('createCheckoutSession')
  }

  // --- Subscriptions: managed by LS; we mostly read/cancel. ---
  async cancelSubscription(_providerSubId: string, _immediate: boolean): Promise<void> {
    // Real: DELETE /v1/subscriptions/{id} (cancels at period end) or PATCH cancelled.
    return todo('cancelSubscription')
  }
  async getSubscription(_providerSubId: string): Promise<ProviderSubscription> {
    return todo('getSubscription')
  }
  // createSubscription intentionally omitted: with LS the subscription is created
  // by the hosted checkout, not by a separate API call. The webhook
  // `subscription_created` tells us the provider_subscription_id to store.
  async createSubscription(_params: CreateSubscriptionParams): Promise<ProviderSubscription> {
    return todo('createSubscription')
  }

  // --- Webhooks: HMAC-SHA256 of RAW body vs X-Signature header. ---
  async verifyWebhook(_rawBody: string, _headers: Record<string, string>): Promise<boolean> {
    // Real:
    //   const sig = headers['x-signature']
    //   const digest = createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET!)
    //                    .update(rawBody).digest('hex')
    //   return timingSafeEqual(Buffer.from(sig), Buffer.from(digest))
    return todo('verifyWebhook')
  }

  async normalizeWebhookEvent(_rawBody: string): Promise<NormalizedBillingEvent | null> {
    // Real mapping (meta.event_name → our vocabulary):
    //   subscription_created   → 'subscription.activated'
    //   subscription_updated   → 'subscription.renewed' (if active) / 'subscription.past_due'
    //   subscription_payment_failed → 'subscription.past_due'
    //   subscription_cancelled → 'subscription.canceled'
    //   subscription_expired   → 'subscription.expired'
    // reference recovered from meta.custom_data.reference; periodEnd from
    // data.attributes.renews_at.
    return todo('normalizeWebhookEvent')
  }

  async refund(_params: RefundParams): Promise<void> {
    return todo('refund')
  }
}
