/**
 * Lemon Squeezy Payment Provider Implementation
 *
 * Uses raw `fetch` + Node `crypto` — no SDK dependency.
 * Lemon Squeezy is a Merchant of Record: they handle tax remittance, so no
 * Stripe Connect destination / application-fee split is needed.
 *
 * Catalog (products/variants) is managed in the LS dashboard. All catalog
 * methods throw a "not supported" error rather than attempting API calls —
 * callers should check `capabilities.isMerchantOfRecord` before calling them.
 */

import crypto from 'crypto'
import {
  IPaymentProvider,
  PaymentProvider,
  PaymentProduct,
  PaymentPrice,
  CreateProductParams,
  CreatePriceParams,
  UpdateProductParams,
  UpdatePriceParams,
  ProviderSubscription,
  UpdateSubscriptionParams,
  ProviderCapabilities,
  NormalizedBillingEvent,
  CreateCheckoutParams,
  CheckoutSession,
  RefundParams,
} from './types'

const LS_BASE_URL = 'https://api.lemonsqueezy.com'

export class LemonSqueezyProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'lemonsqueezy'

  /**
   * Lemon Squeezy is a Merchant of Record (remits tax itself), offers hosted
   * checkout with a redirect URL, fires renewal/failure/cancellation webhooks,
   * and supports programmatic refunds against subscription invoices.
   * We do NOT self-manage the billing period — LS tracks renews_at for us.
   */
  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: true,
    supportsRefunds: true,
    isMerchantOfRecord: true,
    selfManagedPeriod: false,
    createsCatalog: false,
    supportsPlanChange: true,
  }

  private readonly apiKey: string
  private readonly storeId: string
  private readonly webhookSecret: string
  private readonly headers: Record<string, string>

  constructor(apiKey: string, storeId: string, webhookSecret: string) {
    this.apiKey = apiKey
    this.storeId = storeId
    this.webhookSecret = webhookSecret
    this.headers = {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    }
  }

  /**
   * Convert amount between base units (cents) and major units (dollars).
   * Lemon Squeezy, like Stripe, operates in cents for USD/EUR.
   */
  convertAmount(amount: number, fromUnit: 'base' | 'major'): number {
    return fromUnit === 'major' ? Math.round(amount * 100) : amount
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------

  /**
   * Create a Lemon Squeezy hosted checkout session.
   *
   * Both `one_time` and `subscription` modes POST to the same `/v1/checkouts`
   * endpoint — the variant referenced by `params.providerPriceId` determines
   * whether the resulting order is one-time or recurring.
   *
   * The `reference` value is embedded in `checkout_data.custom` so it
   * round-trips back to `meta.custom_data.reference` on every webhook, letting
   * the unified dispatcher match the event to our internal transaction/sub row.
   *
   * @returns CheckoutSession with `kind: 'redirect'` and the LS checkout URL.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
    // Build the custom data bag — all values must be strings for LS JSON:API.
    const customData: Record<string, string> = { reference: params.reference }
    if (params.metadata) {
      for (const [k, v] of Object.entries(params.metadata)) {
        customData[k] = String(v)
      }
    }

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            custom: customData,
          },
          product_options: {
            ...(params.successUrl ? { redirect_url: params.successUrl } : {}),
          },
        },
        relationships: {
          store: {
            data: { type: 'stores', id: this.storeId },
          },
          variant: {
            data: { type: 'variants', id: params.providerPriceId },
          },
        },
      },
    }

    const response = await fetch(`${LS_BASE_URL}/v1/checkouts`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `LemonSqueezy createCheckoutSession failed: HTTP ${response.status} — ${text}`,
      )
    }

    const json = await response.json()
    const url: string = json.data.attributes.url
    const providerRef: string = String(json.data.id)

    return {
      kind: 'redirect',
      url,
      reference: params.reference,
      providerRef,
    }
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  /**
   * Verify a Lemon Squeezy webhook signature.
   *
   * LS signs the raw body with HMAC-SHA256 (hex digest) and puts the result in
   * the `X-Signature` header. We fall back to `process.env.LEMONSQUEEZY_WEBHOOK_SECRET`
   * if the constructor received an empty string.
   *
   * Timing-safe comparison is used to prevent timing attacks.
   */
  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<boolean> {
    const secret = this.webhookSecret || process.env.LEMONSQUEEZY_WEBHOOK_SECRET
    if (!secret) return false

    const signature = headers['x-signature'] ?? headers['X-Signature']
    if (!signature) return false

    try {
      const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

      const digestBuf = Buffer.from(digest, 'utf8')
      const sigBuf = Buffer.from(signature, 'utf8')

      // timingSafeEqual throws if the buffers differ in length — guard first.
      if (digestBuf.length !== sigBuf.length) return false

      return crypto.timingSafeEqual(digestBuf, sigBuf)
    } catch {
      return false
    }
  }

  /**
   * Collapse a Lemon Squeezy webhook payload into our internal billing vocabulary.
   * Called AFTER `verifyWebhook`, so a plain JSON.parse of the trusted body is safe.
   *
   * LS does not include a unique event id in its payloads, so we synthesise one
   * that is stable per distinct event: `${event_name}:${sub_id}:${updated_at}`.
   * Including `updated_at` ensures two consecutive renewals (different timestamps)
   * produce different ids and are not collapsed as duplicates by the idempotency
   * guard in the unified webhook route.
   *
   * Returns null for event types not modelled in our vocabulary.
   */
  async normalizeWebhookEvent(rawBody: string): Promise<NormalizedBillingEvent | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return null
    }

    const eventName: string | undefined = payload.meta?.event_name
    const customData = (payload.meta?.custom_data ?? {}) as Record<string, string>
    const reference: string | undefined = customData.reference

    // For subscription lifecycle events, subId is the subscription's own id.
    // For invoice events (subscription_payment_*), the sub id is on attributes.
    const isInvoiceEvent =
      eventName === 'subscription_payment_success' || eventName === 'subscription_payment_failed'

    // For order events (one-time purchases) data.id is the ORDER id; we reuse
    // `subId` as the generic provider object id for the synthesised event key.
    const subId: string = isInvoiceEvent
      ? String(payload.data?.attributes?.subscription_id ?? '')
      : String(payload.data?.id ?? '')

    const renewsAt: string | undefined = payload.data?.attributes?.renews_at
    const periodEnd: Date | undefined = renewsAt ? new Date(renewsAt) : undefined

    // Synthesise a stable-but-unique event id (LS has no native event id field).
    const updatedAt: string = payload.data?.attributes?.updated_at ?? ''
    const providerEventId = `${eventName ?? 'unknown'}:${subId}:${updatedAt}`

    switch (eventName) {
      case 'subscription_created':
        return {
          type: 'subscription.activated',
          providerEventId,
          providerSubscriptionId: subId,
          periodEnd,
          reference,
          // Echoed checkout metadata (userId/tenantId) — the dispatcher binds
          // the pending-transaction flip to these so a signed event can't
          // activate someone else's transaction by id alone.
          metadata: customData,
          raw: payload,
        }

      case 'subscription_payment_success':
        // Renewal — extends the period. The FIRST payment's activation is
        // already handled by `subscription_created`; `subscription.renewed` is
        // idempotent so any overlap on the initial payment is safe.
        return {
          type: 'subscription.renewed',
          providerEventId,
          providerSubscriptionId: subId,
          periodEnd,
          reference,
          raw: payload,
        }

      case 'subscription_payment_failed':
        return {
          type: 'subscription.past_due',
          providerEventId,
          providerSubscriptionId: subId,
          reference,
          raw: payload,
        }

      case 'subscription_cancelled':
        return {
          type: 'subscription.canceled',
          providerEventId,
          providerSubscriptionId: subId,
          reference,
          raw: payload,
        }

      case 'subscription_expired':
        return {
          type: 'subscription.expired',
          providerEventId,
          providerSubscriptionId: subId,
          reference,
          raw: payload,
        }

      // One-time purchase. LS fires `order_created` for EVERY order — including
      // the first charge of a subscription — so this maps to the generic
      // `payment.succeeded`. The shared dispatcher decides what to do: it acts
      // only when the matched transaction is a one-time product (plan_id NULL)
      // and skips subscription orders (owned by `subscription_created`). The
      // echoed checkout metadata (userId/tenantId) binds the activation to the
      // originating buyer so a signed event can't complete someone else's
      // transaction by id alone.
      case 'order_created':
        return {
          type: 'payment.succeeded',
          providerEventId, // order_created:<orderId>:<updatedAt> — orderId is unique
          providerPaymentId: subId, // LS order id
          reference,
          metadata: customData,
          raw: payload,
        }

      // One-time order refund. Maps to `refund.succeeded`; the shared dispatcher
      // flips the transaction → refunded and revokes the product entitlements
      // (subscription refunds are handled by subscription_cancelled/expired).
      case 'order_refunded':
        return {
          type: 'refund.succeeded',
          providerEventId, // order_refunded:<orderId>:<updatedAt>
          providerPaymentId: subId,
          reference,
          raw: payload,
        }

      default:
        return null
    }
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Cancel a Lemon Squeezy subscription.
   *
   * The LS API always cancels at period end — there is no immediate-cancel
   * endpoint. The `immediate` flag is accepted for interface compatibility but
   * has no effect; the subscription remains accessible until `renews_at`.
   */
  async cancelSubscription(providerSubId: string, _immediate: boolean): Promise<void> {
    // NOTE: `immediate` is ignored — LS only supports cancel-at-period-end via API.
    const response = await fetch(`${LS_BASE_URL}/v1/subscriptions/${providerSubId}`, {
      method: 'DELETE',
      headers: this.headers,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `LemonSqueezy cancelSubscription failed: HTTP ${response.status} — ${text}`,
      )
    }
  }

  /**
   * Retrieve the current state of a Lemon Squeezy subscription.
   *
   * Maps LS status strings to our three-value enum:
   * - `active` / `on_trial` → 'active'
   * - `past_due`            → 'past_due'
   * - everything else       → 'canceled'
   */
  async getSubscription(providerSubId: string): Promise<ProviderSubscription> {
    const response = await fetch(`${LS_BASE_URL}/v1/subscriptions/${providerSubId}`, {
      method: 'GET',
      headers: this.headers,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `LemonSqueezy getSubscription failed: HTTP ${response.status} — ${text}`,
      )
    }

    const json = await response.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs: any = json.data.attributes

    const lsStatus: string = attrs.status ?? ''
    const status: ProviderSubscription['status'] =
      lsStatus === 'active' || lsStatus === 'on_trial'
        ? 'active'
        : lsStatus === 'past_due'
          ? 'past_due'
          : 'canceled'

    return {
      id: String(json.data.id),
      status,
      currentPeriodEnd: new Date(attrs.renews_at),
      cancelAtPeriodEnd: !!attrs.cancelled,
    }
  }

  /**
   * Move a Lemon Squeezy subscription to a different variant (plan) in place.
   *
   * `PATCH /v1/subscriptions/{id}` with a new `variant_id` swaps the plan on the
   * SAME subscription — the id is unchanged — so a plan change never creates a
   * second live subscription. LS prorates the mid-period difference by default
   * (we do not set `disable_prorations`). `params.newProviderPriceId` is the
   * target plan's LS variant id (numeric, stored as text in provider_price_id).
   */
  async updateSubscription(
    providerSubId: string,
    params: UpdateSubscriptionParams,
  ): Promise<ProviderSubscription> {
    const variantId = Number(params.newProviderPriceId)
    if (!Number.isFinite(variantId)) {
      throw new Error(
        `LemonSqueezy updateSubscription: invalid variant id "${params.newProviderPriceId}"`,
      )
    }

    const response = await fetch(`${LS_BASE_URL}/v1/subscriptions/${providerSubId}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({
        data: {
          type: 'subscriptions',
          id: String(providerSubId),
          attributes: { variant_id: variantId },
        },
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `LemonSqueezy updateSubscription failed: HTTP ${response.status} — ${text}`,
      )
    }

    const json = await response.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attrs: any = json.data.attributes
    const lsStatus: string = attrs.status ?? ''
    const status: ProviderSubscription['status'] =
      lsStatus === 'active' || lsStatus === 'on_trial'
        ? 'active'
        : lsStatus === 'past_due'
          ? 'past_due'
          : 'canceled'

    return {
      id: String(json.data.id),
      status,
      currentPeriodEnd: new Date(attrs.renews_at),
      cancelAtPeriodEnd: !!attrs.cancelled,
    }
  }

  // ---------------------------------------------------------------------------
  // Refunds
  // ---------------------------------------------------------------------------

  /**
   * Issue a refund against a Lemon Squeezy subscription invoice.
   *
   * Because LS is a Merchant of Record, refunds are issued via their API against
   * a subscription-invoice id (not a payment intent). Pass the LS invoice id as
   * `params.providerPaymentId`. Omit `params.amount` for a full refund.
   *
   * @param params.providerPaymentId — LS subscription-invoice id.
   * @param params.amount            — Partial refund amount in cents; omit for full.
   */
  async refund(params: RefundParams): Promise<void> {
    const body = params.amount !== undefined ? { amount: params.amount } : {}

    const response = await fetch(
      `${LS_BASE_URL}/v1/subscription-invoices/${params.providerPaymentId}/refund`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      },
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `LemonSqueezy refund failed: HTTP ${response.status} — ${text}`,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Catalog — not supported (managed in LS dashboard)
  // ---------------------------------------------------------------------------

  /**
   * Not supported — manage products/variants in the Lemon Squeezy dashboard.
   */
  async createProduct(_params: CreateProductParams): Promise<PaymentProduct> {
    throw new Error(
      'LemonSqueezy createProduct not supported — manage products/variants in the Lemon Squeezy dashboard',
    )
  }

  /**
   * Not supported — manage products/variants in the Lemon Squeezy dashboard.
   */
  async updateProduct(_productId: string, _params: UpdateProductParams): Promise<PaymentProduct> {
    throw new Error(
      'LemonSqueezy updateProduct not supported — manage products/variants in the Lemon Squeezy dashboard',
    )
  }

  /**
   * Not supported — manage products/variants in the Lemon Squeezy dashboard.
   */
  async getProduct(_productId: string): Promise<PaymentProduct> {
    throw new Error(
      'LemonSqueezy getProduct not supported — manage products/variants in the Lemon Squeezy dashboard',
    )
  }

  /**
   * Not supported — manage products/variants in the Lemon Squeezy dashboard.
   */
  async archiveProduct(_productId: string): Promise<void> {
    throw new Error(
      'LemonSqueezy archiveProduct not supported — manage products/variants in the Lemon Squeezy dashboard',
    )
  }

  /**
   * Not supported — manage products/variants in the Lemon Squeezy dashboard.
   */
  async restoreProduct(_productId: string): Promise<void> {
    throw new Error(
      'LemonSqueezy restoreProduct not supported — manage products/variants in the Lemon Squeezy dashboard',
    )
  }

  /**
   * Not supported — manage products/variants in the Lemon Squeezy dashboard.
   */
  async createPrice(_params: CreatePriceParams): Promise<PaymentPrice> {
    throw new Error(
      'LemonSqueezy createPrice not supported — manage products/variants in the Lemon Squeezy dashboard',
    )
  }

  /**
   * Not supported — manage products/variants in the Lemon Squeezy dashboard.
   */
  async updatePrice(_priceId: string, _params: UpdatePriceParams): Promise<PaymentPrice> {
    throw new Error(
      'LemonSqueezy updatePrice not supported — manage products/variants in the Lemon Squeezy dashboard',
    )
  }

  /**
   * Not supported — manage products/variants in the Lemon Squeezy dashboard.
   */
  async getPrice(_priceId: string): Promise<PaymentPrice> {
    throw new Error(
      'LemonSqueezy getPrice not supported — manage products/variants in the Lemon Squeezy dashboard',
    )
  }

  /**
   * Not supported — manage products/variants in the Lemon Squeezy dashboard.
   */
  async archivePrice(_priceId: string): Promise<void> {
    throw new Error(
      'LemonSqueezy archivePrice not supported — manage products/variants in the Lemon Squeezy dashboard',
    )
  }
}
