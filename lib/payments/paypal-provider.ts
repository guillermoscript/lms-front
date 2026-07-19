/**
 * PayPal Payment Provider Implementation
 *
 * Uses raw `fetch` — no SDK dependency (mirrors the Lemon Squeezy provider).
 *
 * - Catalog: Catalog Products API + Billing Plans API (createsCatalog: true —
 *   the plan/product create actions auto-generate provider ids).
 * - One-time checkout: Orders v2 (`intent: CAPTURE`) → hosted approve link
 *   (`kind: 'redirect'`). The buyer returns to
 *   `/api/payments/paypal/capture`, which captures the approved order and
 *   dispatches `payment.succeeded`; the `PAYMENT.CAPTURE.COMPLETED` webhook is
 *   the idempotent backstop.
 * - Subscriptions: Billing Subscriptions API → approve link. Activation is
 *   webhook-driven (`BILLING.SUBSCRIPTION.ACTIVATED`), so a configured webhook
 *   (PAYPAL_WEBHOOK_ID) is REQUIRED for plan purchases to activate.
 * - Webhook verification: PayPal's verify-webhook-signature API (needs the
 *   webhook id from the PayPal developer dashboard).
 *
 * Owner-binding: the unified dispatcher fails CLOSED unless userId/tenantId
 * round-trip on the webhook. PayPal only gives us a single 127-char `custom_id`
 * string, so we pack `reference|userId|tenantId` into it (encodePayPalCustomId /
 * decodePayPalCustomId) and unpack it back into event.metadata on normalize.
 */

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
  ProviderCapabilities,
  NormalizedBillingEvent,
  CreateCheckoutParams,
  CheckoutSession,
  RefundParams,
} from './types'

/**
 * One-time prices have no PayPal catalog object (Orders v2 charges a raw
 * amount), so createPrice synthesises a deterministic id with this prefix.
 * Checkout never sends it to PayPal — it only satisfies the provider_price_id
 * column that catalog-creating providers are expected to fill.
 */
const ONE_TIME_PRICE_PREFIX = 'PAYPAL-ONETIME'

/** Pack reference|userId|tenantId into PayPal's single custom_id string (≤127 chars). */
export function encodePayPalCustomId(
  reference: string,
  metadata?: Record<string, string>,
): string {
  return [reference, metadata?.userId ?? '', metadata?.tenantId ?? ''].join('|')
}

/** Unpack custom_id back into the dispatcher's expected metadata shape. */
export function decodePayPalCustomId(customId: string | undefined | null): {
  reference?: string
  metadata?: Record<string, string>
} {
  if (!customId) return {}
  const [reference, userId, tenantId] = customId.split('|')
  if (!reference) return {}
  const metadata: Record<string, string> = {}
  if (userId) metadata.userId = userId
  if (tenantId) metadata.tenantId = tenantId
  return { reference, metadata: Object.keys(metadata).length ? metadata : undefined }
}

export class PayPalPaymentProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'paypal'
  // PayPal: hosted checkout redirect, native Billing Plans (recurring) +
  // webhooks, programmatic refunds. Not a Merchant of Record. Billing Plans
  // have no in-place price-swap-with-proration, so plan changes go through the
  // app-side supersession path (supportsPlanChange: false).
  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: true,
    supportsRefunds: true,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
    createsCatalog: true,
    supportsPlanChange: false,
  }

  private readonly clientId: string
  private readonly clientSecret: string
  private readonly webhookId: string | undefined
  private readonly baseUrl: string

  private accessToken: string | null = null
  private tokenExpiresAt = 0

  constructor(
    clientId: string,
    clientSecret: string,
    webhookId?: string,
    environment: 'sandbox' | 'live' = 'sandbox',
  ) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.webhookId = webhookId
    this.baseUrl =
      environment === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com'
  }

  convertAmount(amount: number, fromUnit: 'base' | 'major'): number {
    // PayPal uses major units (dollars, not cents)
    return fromUnit === 'major' ? amount : amount / 100
  }

  // ---------------------------------------------------------------------------
  // Auth + request plumbing
  // ---------------------------------------------------------------------------

  /** OAuth2 client-credentials token, cached until 60s before expiry. */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken
    }

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`PayPal OAuth token request failed: HTTP ${response.status} — ${text}`)
    }

    const json = await response.json()
    this.accessToken = json.access_token as string
    this.tokenExpiresAt = Date.now() + Number(json.expires_in ?? 0) * 1000
    return this.accessToken
  }

  /** Authenticated JSON request. Returns null for 204-No-Content responses. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async api(path: string, init?: RequestInit & { label?: string }): Promise<any> {
    const token = await this.getAccessToken()
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `PayPal ${init?.label ?? path} failed: HTTP ${response.status} — ${text}`,
      )
    }

    if (response.status === 204) return null
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }

  // ---------------------------------------------------------------------------
  // Catalog — Catalog Products API + Billing Plans API
  // ---------------------------------------------------------------------------

  async createProduct(params: CreateProductParams): Promise<PaymentProduct> {
    const json = await this.api('/v1/catalogs/products', {
      method: 'POST',
      label: 'createProduct',
      body: JSON.stringify({
        name: params.name,
        description: params.description || undefined,
        type: 'DIGITAL',
        ...(params.images?.[0] ? { image_url: params.images[0] } : {}),
      }),
    })

    return {
      id: json.id,
      name: json.name,
      description: json.description ?? '',
      amount: 0,
      currency: 'usd',
      metadata: params.metadata,
    }
  }

  /**
   * PayPal catalog products only allow PATCHing description/category/image_url/
   * home_url — the name is immutable. A requested name change is therefore not
   * forwarded; our own products/plans tables remain the display source of truth.
   */
  async updateProduct(productId: string, params: UpdateProductParams): Promise<PaymentProduct> {
    const ops: Array<{ op: string; path: string; value: string }> = []
    if (params.description !== undefined) {
      ops.push({ op: 'replace', path: '/description', value: params.description })
    }
    if (params.images?.[0]) {
      ops.push({ op: 'replace', path: '/image_url', value: params.images[0] })
    }

    if (ops.length > 0) {
      await this.api(`/v1/catalogs/products/${productId}`, {
        method: 'PATCH',
        label: 'updateProduct',
        body: JSON.stringify(ops),
      })
    }

    return this.getProduct(productId)
  }

  async getProduct(productId: string): Promise<PaymentProduct> {
    const json = await this.api(`/v1/catalogs/products/${productId}`, {
      method: 'GET',
      label: 'getProduct',
    })

    return {
      id: json.id,
      name: json.name,
      description: json.description ?? '',
      amount: 0,
      currency: 'usd',
    }
  }

  /**
   * PayPal catalog products cannot be archived or deleted via the API — the
   * app-side `status` column is what gates visibility, and billing plans (the
   * chargeable objects) are deactivated via archivePrice. No-op by design.
   */
  async archiveProduct(_productId: string): Promise<void> {}

  /** See archiveProduct — nothing to restore on PayPal's side. */
  async restoreProduct(_productId: string): Promise<void> {}

  /**
   * Subscription prices become PayPal Billing Plans (P-…). One-time prices have
   * no PayPal object — Orders v2 charges the transaction amount directly — so
   * they get a deterministic synthetic id.
   *
   * `params.amount` arrives in PayPal's unit (major — the actions convert via
   * `convertAmount(price, 'major')`, an identity for PayPal).
   */
  async createPrice(params: CreatePriceParams): Promise<PaymentPrice> {
    if (params.type === 'one_time') {
      return {
        id: `${ONE_TIME_PRICE_PREFIX}:${params.productId}`,
        productId: params.productId,
        amount: params.amount,
        currency: params.currency,
        type: 'one_time',
        metadata: params.metadata,
      }
    }

    const interval = params.interval ?? 'month'
    const json = await this.api('/v1/billing/plans', {
      method: 'POST',
      label: 'createPrice (billing plan)',
      body: JSON.stringify({
        product_id: params.productId,
        name: params.metadata?.plan_name || `Plan ${params.productId}`,
        billing_cycles: [
          {
            frequency: {
              interval_unit: interval === 'year' ? 'YEAR' : 'MONTH',
              interval_count: params.intervalCount ?? 1,
            },
            tenure_type: 'REGULAR',
            sequence: 1,
            total_cycles: 0, // infinite until canceled
            pricing_scheme: {
              fixed_price: {
                value: params.amount.toFixed(2),
                currency_code: params.currency.toUpperCase(),
              },
            },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee_failure_action: 'CONTINUE',
          payment_failure_threshold: 3,
        },
      }),
    })

    return {
      id: json.id,
      productId: params.productId,
      amount: params.amount,
      currency: params.currency,
      type: 'subscription',
      interval,
      metadata: params.metadata,
    }
  }

  /** Billing plans support activate/deactivate; synthetic one-time ids are app-side only. */
  async updatePrice(priceId: string, params: UpdatePriceParams): Promise<PaymentPrice> {
    if (!priceId.startsWith(ONE_TIME_PRICE_PREFIX) && params.active !== undefined) {
      await this.api(`/v1/billing/plans/${priceId}/${params.active ? 'activate' : 'deactivate'}`, {
        method: 'POST',
        label: 'updatePrice (activate/deactivate)',
      })
    }
    return this.getPrice(priceId)
  }

  async getPrice(priceId: string): Promise<PaymentPrice> {
    if (priceId.startsWith(ONE_TIME_PRICE_PREFIX)) {
      const productId = priceId.split(':')[1] ?? ''
      return { id: priceId, productId, amount: 0, currency: 'usd', type: 'one_time' }
    }

    const json = await this.api(`/v1/billing/plans/${priceId}`, {
      method: 'GET',
      label: 'getPrice',
    })

    const cycle = (json.billing_cycles ?? []).find(
      (c: { tenure_type?: string }) => c.tenure_type === 'REGULAR',
    )
    const fixedPrice = cycle?.pricing_scheme?.fixed_price

    return {
      id: json.id,
      productId: json.product_id ?? '',
      amount: fixedPrice ? Number(fixedPrice.value) : 0,
      currency: (fixedPrice?.currency_code ?? 'USD').toLowerCase() as PaymentPrice['currency'],
      type: 'subscription',
      interval: cycle?.frequency?.interval_unit === 'YEAR' ? 'year' : 'month',
    }
  }

  async archivePrice(priceId: string): Promise<void> {
    if (priceId.startsWith(ONE_TIME_PRICE_PREFIX)) return
    await this.api(`/v1/billing/plans/${priceId}/deactivate`, {
      method: 'POST',
      label: 'archivePrice (deactivate)',
    })
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------

  /**
   * Create a hosted PayPal checkout.
   *
   * - `one_time` → Orders v2 order (intent CAPTURE). The approve link returns
   *   the buyer to our capture route (`/api/payments/paypal/capture`), which
   *   captures the order and redirects on to `successUrl`.
   * - `subscription` → Billing Subscriptions API against the plan's Billing
   *   Plan id (`providerPriceId`). Activation arrives on the
   *   `BILLING.SUBSCRIPTION.ACTIVATED` webhook.
   *
   * `reference|userId|tenantId` is packed into `custom_id` so the webhook
   * owner-binding guard can verify the originating buyer/tenant.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
    const customId = encodePayPalCustomId(params.reference, params.metadata)
    const cancelUrl = params.cancelUrl ?? params.baseUrl ?? ''

    if (params.mode === 'subscription') {
      if (!params.providerPriceId) {
        throw new Error('PayPal subscription checkout requires a Billing Plan id (provider_price_id)')
      }

      const json = await this.api('/v1/billing/subscriptions', {
        method: 'POST',
        label: 'createCheckoutSession (subscription)',
        body: JSON.stringify({
          plan_id: params.providerPriceId,
          custom_id: customId,
          application_context: {
            user_action: 'SUBSCRIBE_NOW',
            shipping_preference: 'NO_SHIPPING',
            return_url: params.successUrl,
            cancel_url: cancelUrl,
          },
        }),
      })

      const approve = (json.links ?? []).find((l: { rel: string }) => l.rel === 'approve')
      if (!approve?.href) {
        throw new Error('PayPal subscription response missing approve link')
      }

      return {
        kind: 'redirect',
        url: approve.href,
        reference: params.reference,
        providerRef: json.id, // I-… subscription id
      }
    }

    // One-time: the buyer must return through our capture route — PayPal does
    // not auto-capture an approved order. `next` carries the final success URL.
    const captureReturnUrl = `${params.baseUrl}/api/payments/paypal/capture?next=${encodeURIComponent(
      params.successUrl ?? `${params.baseUrl}/checkout/success?transactionId=${params.reference}`,
    )}`

    const json = await this.api('/v2/checkout/orders', {
      method: 'POST',
      label: 'createCheckoutSession (order)',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: params.reference,
            custom_id: customId,
            description: params.metadata?.itemName?.slice(0, 127),
            amount: {
              currency_code: params.currency.toUpperCase(),
              value: params.amount.toFixed(2),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              return_url: captureReturnUrl,
              cancel_url: cancelUrl,
            },
          },
        },
      }),
    })

    const approve = (json.links ?? []).find(
      (l: { rel: string }) => l.rel === 'payer-action' || l.rel === 'approve',
    )
    if (!approve?.href) {
      throw new Error('PayPal order response missing approve link')
    }

    return {
      kind: 'redirect',
      url: approve.href,
      reference: params.reference,
      providerRef: json.id, // order id
    }
  }

  /**
   * Capture an approved order (called by the capture return route). Returns the
   * capture id + the decoded custom_id so the route can dispatch
   * `payment.succeeded` with owner-binding metadata.
   */
  async captureOrder(orderId: string): Promise<{
    captureId: string
    status: string
    reference?: string
    metadata?: Record<string, string>
  }> {
    const json = await this.api(`/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      label: 'captureOrder',
      body: JSON.stringify({}),
    })

    const unit = json.purchase_units?.[0]
    const capture = unit?.payments?.captures?.[0]
    if (!capture?.id) {
      throw new Error(`PayPal captureOrder: no capture in response for order ${orderId}`)
    }

    const decoded = decodePayPalCustomId(capture.custom_id ?? unit?.custom_id)
    return {
      captureId: capture.id,
      status: capture.status ?? json.status ?? '',
      ...decoded,
    }
  }

  /** Fetch an order (used by the capture route to handle already-captured retries). */
  async getOrder(orderId: string): Promise<{
    status: string
    captureId?: string
    reference?: string
    metadata?: Record<string, string>
  }> {
    const json = await this.api(`/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      label: 'getOrder',
    })
    const unit = json.purchase_units?.[0]
    const capture = unit?.payments?.captures?.[0]
    const decoded = decodePayPalCustomId(capture?.custom_id ?? unit?.custom_id)
    return {
      status: json.status ?? '',
      captureId: capture?.id,
      ...decoded,
    }
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  /**
   * Verify a PayPal webhook via the verify-webhook-signature API. Requires the
   * webhook id (PAYPAL_WEBHOOK_ID) that PayPal assigned when the webhook was
   * registered in the developer dashboard — returns false when unset.
   */
  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<boolean> {
    const webhookId = this.webhookId || process.env.PAYPAL_WEBHOOK_ID
    if (!webhookId) return false

    const h = (name: string) => headers[name] ?? headers[name.toLowerCase()]
    const transmissionId = h('paypal-transmission-id')
    const transmissionTime = h('paypal-transmission-time')
    const transmissionSig = h('paypal-transmission-sig')
    const certUrl = h('paypal-cert-url')
    const authAlgo = h('paypal-auth-algo')
    if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
      return false
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let event: any
    try {
      event = JSON.parse(rawBody)
    } catch {
      return false
    }

    try {
      const json = await this.api('/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        label: 'verifyWebhook',
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: event,
        }),
      })
      return json?.verification_status === 'SUCCESS'
    } catch {
      return false
    }
  }

  /**
   * Collapse a PayPal webhook into the internal billing vocabulary. Called
   * AFTER verifyWebhook. PayPal events carry a native unique id (`WH-…`), used
   * directly as the idempotency key.
   *
   * Renewals (`PAYMENT.SALE.COMPLETED` with a billing_agreement_id) don't carry
   * the new period end, so we fetch the subscription's next_billing_time; on
   * failure the event still dispatches and the shared dispatcher logs the
   * missing periodEnd rather than extending access.
   */
  async normalizeWebhookEvent(rawBody: string): Promise<NormalizedBillingEvent | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return null
    }

    const providerEventId: string | undefined = payload.id
    const eventType: string | undefined = payload.event_type
    const resource = payload.resource ?? {}

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const { reference, metadata } = decodePayPalCustomId(resource.custom_id)
        return {
          type: 'payment.succeeded',
          providerEventId,
          providerPaymentId: resource.id,
          reference,
          metadata,
          raw: payload,
        }
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        // Refund resources echo the capture's custom_id.
        const { reference } = decodePayPalCustomId(resource.custom_id)
        return {
          type: 'refund.succeeded',
          providerEventId,
          providerPaymentId: resource.id,
          reference,
          raw: payload,
        }
      }

      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const { reference, metadata } = decodePayPalCustomId(resource.custom_id)
        const nextBilling = resource.billing_info?.next_billing_time
        return {
          type: 'subscription.activated',
          providerEventId,
          providerSubscriptionId: resource.id,
          periodEnd: nextBilling ? new Date(nextBilling) : undefined,
          reference,
          metadata,
          raw: payload,
        }
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED': {
        const { reference } = decodePayPalCustomId(resource.custom_id)
        return {
          type: 'subscription.canceled',
          providerEventId,
          providerSubscriptionId: resource.id,
          reference,
          raw: payload,
        }
      }

      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        const { reference } = decodePayPalCustomId(resource.custom_id)
        return {
          type: 'subscription.expired',
          providerEventId,
          providerSubscriptionId: resource.id,
          reference,
          raw: payload,
        }
      }

      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const { reference } = decodePayPalCustomId(resource.custom_id)
        return {
          type: 'subscription.past_due',
          providerEventId,
          providerSubscriptionId: resource.id,
          reference,
          raw: payload,
        }
      }

      // Recurring renewal charge. The sale's billing_agreement_id is the
      // subscription id (I-…). First-cycle sales overlap with ACTIVATED —
      // subscription.renewed is idempotent (period extension), so that's safe.
      case 'PAYMENT.SALE.COMPLETED': {
        const subscriptionId: string | undefined = resource.billing_agreement_id
        if (!subscriptionId) return null // plain sale outside our subscription flow

        let periodEnd: Date | undefined
        try {
          const sub = await this.api(`/v1/billing/subscriptions/${subscriptionId}`, {
            method: 'GET',
            label: 'normalizeWebhookEvent (renewal period fetch)',
          })
          const nextBilling = sub?.billing_info?.next_billing_time
          periodEnd = nextBilling ? new Date(nextBilling) : undefined
        } catch (err) {
          console.warn(
            `[paypal] could not fetch subscription ${subscriptionId} for renewal period end:`,
            err,
          )
        }

        const { reference } = decodePayPalCustomId(resource.custom ?? resource.custom_id)
        return {
          type: 'subscription.renewed',
          providerEventId,
          providerSubscriptionId: subscriptionId,
          providerPaymentId: resource.id,
          periodEnd,
          reference,
          raw: payload,
        }
      }

      default:
        return null
    }
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Cancel a PayPal subscription. PayPal's cancel endpoint stops all future
   * billing immediately and is irreversible; there is no native
   * cancel-at-period-end, so the `immediate` flag only annotates the reason.
   * (Same access semantics as Lemon Squeezy: the CANCELLED webhook drives the
   * app-side status change.)
   */
  async cancelSubscription(providerSubId: string, immediate: boolean): Promise<void> {
    await this.api(`/v1/billing/subscriptions/${providerSubId}/cancel`, {
      method: 'POST',
      label: 'cancelSubscription',
      body: JSON.stringify({
        reason: immediate ? 'Canceled immediately by school admin' : 'Canceled by subscriber',
      }),
    })
  }

  async getSubscription(providerSubId: string): Promise<ProviderSubscription> {
    const json = await this.api(`/v1/billing/subscriptions/${providerSubId}`, {
      method: 'GET',
      label: 'getSubscription',
    })

    const ppStatus: string = json.status ?? ''
    const status: ProviderSubscription['status'] =
      ppStatus === 'ACTIVE'
        ? 'active'
        : ppStatus === 'SUSPENDED'
          ? 'past_due'
          : 'canceled'

    const nextBilling = json.billing_info?.next_billing_time
    return {
      id: json.id,
      status,
      currentPeriodEnd: nextBilling ? new Date(nextBilling) : new Date(0),
      cancelAtPeriodEnd: false, // PayPal cancels are immediate; no scheduled state
    }
  }

  // ---------------------------------------------------------------------------
  // Refunds
  // ---------------------------------------------------------------------------

  /**
   * Refund a captured payment. `providerPaymentId` is the capture id from
   * `PAYMENT.CAPTURE.COMPLETED` / the capture route. Partial refunds need the
   * currency, so the capture is fetched first; omit `amount` for a full refund.
   */
  async refund(params: RefundParams): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = {}
    if (params.amount !== undefined) {
      const capture = await this.api(`/v2/payments/captures/${params.providerPaymentId}`, {
        method: 'GET',
        label: 'refund (capture lookup)',
      })
      body = {
        amount: {
          value: params.amount.toFixed(2),
          currency_code: capture?.amount?.currency_code ?? 'USD',
        },
      }
    }
    if (params.reason) body.note_to_payer = params.reason.slice(0, 255)

    await this.api(`/v2/payments/captures/${params.providerPaymentId}/refund`, {
      method: 'POST',
      label: 'refund',
      body: JSON.stringify(body),
    })
  }
}
