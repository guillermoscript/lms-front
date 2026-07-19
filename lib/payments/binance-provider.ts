/**
 * Binance Pay Payment Provider Implementation
 *
 * Uses raw `fetch` + Node `crypto` — no SDK dependency (mirrors the Lemon
 * Squeezy provider).
 *
 * Binance Pay is a hosted crypto checkout (C2B): we create an order and
 * redirect the buyer to Binance's checkout page (`kind: 'redirect'`). Prices
 * are USD; the order is denominated in USDT (a 1:1 USD stablecoin — the same
 * convention as the Solana USDC path).
 *
 * There are no native recurring subscriptions: `selfManagedPeriod: true`, so a
 * plan purchase is a one-time payment whose confirmation activates/extends the
 * period app-side (`handle_new_subscription` / renewal path) and the expiry
 * cron lapses it — the same model as Solana one-time. The provider therefore
 * normalizes a PAY_SUCCESS for a plan checkout as `subscription.activated`
 * (with the Binance order id as a synthetic provider_subscription_id) and for
 * a product checkout as `payment.succeeded`; `passThroughInfo` tells the two
 * apart and carries the owner-binding userId/tenantId.
 *
 * Request signing: HMAC-SHA512 over `timestamp\nnonce\nbody\n` (hex,
 * uppercase). Webhook verification: RSA-SHA256 over the same shape, checked
 * against Binance's published certificate (fetched via the signed
 * `/certificates` endpoint and cached).
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
  ProviderCapabilities,
  NormalizedBillingEvent,
  CreateCheckoutParams,
  CheckoutSession,
  RefundParams,
} from './types'

const BINANCE_PAY_BASE_URL = 'https://bpay.binanceapi.com'

/** Shape of the JSON we place in the order's passThroughInfo (≤512 chars). */
interface BinancePassThrough {
  userId?: string
  tenantId?: string
  planId?: string
  productId?: string
}

export class BinancePayProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'binance'

  /**
   * Hosted checkout redirect + programmatic refunds, but no native recurring
   * billing and no catalog API — WE own the billing period (the expiry cron
   * lapses unpaid subscriptions), exactly like Solana one-time.
   */
  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: true,
    supportsRefunds: true,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
    createsCatalog: false,
    supportsPlanChange: false,
  }

  private readonly apiKey: string
  private readonly apiSecret: string
  /** Cached Binance webhook-verification public key (PEM). */
  private certPublicKey: string | null = null

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey
    this.apiSecret = apiSecret
  }

  /** Binance Pay amounts are decimal major units (USDT), like PayPal. */
  convertAmount(amount: number, fromUnit: 'base' | 'major'): number {
    return fromUnit === 'major' ? amount : amount / 100
  }

  // ---------------------------------------------------------------------------
  // Request plumbing
  // ---------------------------------------------------------------------------

  /**
   * Signed Binance Pay API request. Signature = uppercase hex HMAC-SHA512 of
   * `timestamp\nnonce\nbody\n` with the merchant secret.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async api(path: string, payload: unknown, label: string): Promise<any> {
    const timestamp = Date.now().toString()
    const nonce = crypto.randomBytes(16).toString('hex')
    const body = JSON.stringify(payload)
    const signature = crypto
      .createHmac('sha512', this.apiSecret)
      .update(`${timestamp}\n${nonce}\n${body}\n`)
      .digest('hex')
      .toUpperCase()

    const response = await fetch(`${BINANCE_PAY_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'BinancePay-Timestamp': timestamp,
        'BinancePay-Nonce': nonce,
        'BinancePay-Certificate-SN': this.apiKey,
        'BinancePay-Signature': signature,
      },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Binance Pay ${label} failed: HTTP ${response.status} — ${text}`)
    }

    const json = await response.json()
    if (json.status !== 'SUCCESS') {
      throw new Error(
        `Binance Pay ${label} failed: ${json.code ?? 'UNKNOWN'} — ${json.errorMessage ?? JSON.stringify(json)}`,
      )
    }
    return json.data
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------

  /**
   * Create a Binance Pay C2B order and return its hosted checkout URL.
   *
   * `merchantTradeNo` (≤32 alphanumeric) carries our numeric transaction id and
   * round-trips on the webhook as the correlation reference. userId/tenantId +
   * planId/productId ride in `passThroughInfo` for the owner-binding guard and
   * the plan-vs-product event mapping.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
    const passThrough: BinancePassThrough = {
      userId: params.metadata?.userId,
      tenantId: params.metadata?.tenantId,
      ...(params.metadata?.planId ? { planId: params.metadata.planId } : {}),
      ...(params.metadata?.productId ? { productId: params.metadata.productId } : {}),
    }

    const data = await this.api(
      '/binancepay/openapi/v3/order',
      {
        env: { terminalType: 'WEB' },
        merchantTradeNo: params.reference,
        orderAmount: Number(params.amount.toFixed(2)),
        // Binance Pay orders are denominated in crypto; USDT is the 1:1 USD
        // stablecoin (same convention as the Solana USDC settlement path).
        currency: 'USDT',
        description: (params.metadata?.itemName ?? 'LMS purchase').slice(0, 256),
        goodsDetails: [
          {
            goodsType: '02', // virtual goods
            goodsCategory: 'Z000', // others
            referenceGoodsId:
              params.metadata?.productId ?? params.metadata?.planId ?? params.reference,
            goodsName: (params.metadata?.itemName ?? 'LMS purchase').slice(0, 256),
          },
        ],
        returnUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        passThroughInfo: JSON.stringify(passThrough),
      },
      'createCheckoutSession',
    )

    if (!data?.checkoutUrl) {
      throw new Error('Binance Pay order response missing checkoutUrl')
    }

    return {
      kind: 'redirect',
      url: data.checkoutUrl,
      reference: params.reference,
      providerRef: data.prepayId,
      expiresAt: data.expireTime ? new Date(Number(data.expireTime)) : undefined,
    }
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  /** Fetch + cache Binance Pay's webhook-signing certificate (public key PEM). */
  private async getCertPublicKey(): Promise<string | null> {
    if (this.certPublicKey) return this.certPublicKey
    try {
      const data = await this.api('/binancepay/openapi/certificates', {}, 'certificates')
      const cert = Array.isArray(data) ? data[0] : data
      this.certPublicKey = cert?.certPublic ?? null
      return this.certPublicKey
    } catch (err) {
      console.error('[binance] certificate fetch failed:', err)
      return null
    }
  }

  /**
   * Verify a Binance Pay webhook: RSA-SHA256 over `timestamp\nnonce\nbody\n`
   * with Binance's certificate public key; signature arrives base64-encoded in
   * the `BinancePay-Signature` header.
   */
  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<boolean> {
    const h = (name: string) => headers[name] ?? headers[name.toLowerCase()]
    const timestamp = h('BinancePay-Timestamp')
    const nonce = h('BinancePay-Nonce')
    const signature = h('BinancePay-Signature')
    if (!timestamp || !nonce || !signature) return false

    const publicKey = await this.getCertPublicKey()
    if (!publicKey) return false

    try {
      return crypto
        .createVerify('RSA-SHA256')
        .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
        .verify(publicKey, signature, 'base64')
    } catch {
      return false
    }
  }

  /**
   * Collapse a Binance Pay notification into the internal vocabulary. Called
   * AFTER verifyWebhook. The notification's `data` field is a JSON *string*.
   *
   * PAY_SUCCESS maps by checkout intent (from passThroughInfo):
   * - plan checkout    → `subscription.activated` — the dispatcher flips the
   *   pending transaction; `handle_new_subscription` creates/extends the
   *   period-managed subscription row (renewals are simply repeat purchases).
   *   The Binance order id acts as the synthetic provider_subscription_id.
   * - product checkout → `payment.succeeded` → `enroll_user`.
   */
  async normalizeWebhookEvent(rawBody: string): Promise<NormalizedBillingEvent | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return null
    }

    const bizType: string | undefined = payload.bizType
    const bizStatus: string | undefined = payload.bizStatus
    const bizId: string = String(payload.bizIdStr ?? payload.bizId ?? '')
    // Stable idempotency key: Binance retries carry the same bizId + status.
    const providerEventId = `${bizType}:${bizId}:${bizStatus}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = {}
    try {
      data = typeof payload.data === 'string' ? JSON.parse(payload.data) : (payload.data ?? {})
    } catch {
      data = {}
    }

    const reference: string | undefined = data.merchantTradeNo
    let passThrough: BinancePassThrough = {}
    try {
      passThrough =
        typeof data.passThroughInfo === 'string'
          ? JSON.parse(data.passThroughInfo)
          : (data.passThroughInfo ?? {})
    } catch {
      passThrough = {}
    }

    const metadata: Record<string, string> = {}
    if (passThrough.userId) metadata.userId = passThrough.userId
    if (passThrough.tenantId) metadata.tenantId = passThrough.tenantId

    if (bizType === 'PAY') {
      if (bizStatus === 'PAY_SUCCESS') {
        if (passThrough.planId) {
          return {
            type: 'subscription.activated',
            providerEventId,
            providerSubscriptionId: bizId, // synthetic — Binance has no subscription object
            providerPaymentId: bizId,
            reference,
            metadata,
            raw: payload,
          }
        }
        return {
          type: 'payment.succeeded',
          providerEventId,
          providerPaymentId: bizId,
          reference,
          metadata,
          raw: payload,
        }
      }
      if (bizStatus === 'PAY_CLOSED') {
        return {
          type: 'payment.failed',
          providerEventId,
          providerPaymentId: bizId,
          reference,
          raw: payload,
        }
      }
      return null
    }

    if (bizType === 'PAY_REFUND' && bizStatus === 'REFUND_SUCCESS') {
      return {
        type: 'refund.succeeded',
        providerEventId,
        providerPaymentId: bizId,
        reference,
        raw: payload,
      }
    }

    return null
  }

  // ---------------------------------------------------------------------------
  // Refunds
  // ---------------------------------------------------------------------------

  /**
   * Refund a Binance Pay order. `providerPaymentId` is the prepayId returned at
   * checkout (stored as the transaction's provider_subscription_id for plan
   * purchases) or the order id from the PAY_SUCCESS webhook. Omit `amount` for
   * a full refund.
   */
  async refund(params: RefundParams): Promise<void> {
    await this.api(
      '/binancepay/openapi/order/refund',
      {
        refundRequestId: `rf-${params.providerPaymentId}-${Date.now()}`.slice(0, 64),
        prepayId: params.providerPaymentId,
        ...(params.amount !== undefined ? { refundAmount: Number(params.amount.toFixed(2)) } : {}),
        ...(params.reason ? { refundReason: params.reason.slice(0, 256) } : {}),
      },
      'refund',
    )
  }

  // ---------------------------------------------------------------------------
  // Catalog — not supported (Binance Pay has no product catalog API)
  // ---------------------------------------------------------------------------

  async createProduct(_params: CreateProductParams): Promise<PaymentProduct> {
    throw new Error('Binance Pay createProduct not supported — Binance Pay has no catalog API')
  }

  async updateProduct(_productId: string, _params: UpdateProductParams): Promise<PaymentProduct> {
    throw new Error('Binance Pay updateProduct not supported — Binance Pay has no catalog API')
  }

  async getProduct(_productId: string): Promise<PaymentProduct> {
    throw new Error('Binance Pay getProduct not supported — Binance Pay has no catalog API')
  }

  async archiveProduct(_productId: string): Promise<void> {
    throw new Error('Binance Pay archiveProduct not supported — Binance Pay has no catalog API')
  }

  async restoreProduct(_productId: string): Promise<void> {
    throw new Error('Binance Pay restoreProduct not supported — Binance Pay has no catalog API')
  }

  async createPrice(_params: CreatePriceParams): Promise<PaymentPrice> {
    throw new Error('Binance Pay createPrice not supported — Binance Pay has no catalog API')
  }

  async updatePrice(_priceId: string, _params: UpdatePriceParams): Promise<PaymentPrice> {
    throw new Error('Binance Pay updatePrice not supported — Binance Pay has no catalog API')
  }

  async getPrice(_priceId: string): Promise<PaymentPrice> {
    throw new Error('Binance Pay getPrice not supported — Binance Pay has no catalog API')
  }

  async archivePrice(_priceId: string): Promise<void> {
    throw new Error('Binance Pay archivePrice not supported — Binance Pay has no catalog API')
  }
}
