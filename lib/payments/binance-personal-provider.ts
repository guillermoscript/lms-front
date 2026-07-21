/**
 * Binance Pay — PERSONAL account provider (issue #482).
 *
 * Merchant Binance Pay (#466) requires KYB, which blocks solo creators. A
 * regular Binance account can still RECEIVE Binance Pay transfers and gets
 * real API keys with a read-only Pay-history endpoint
 * (GET /sapi/v1/pay/transactions). That is enough for the same poll-confirmed
 * model the Solana one-time provider uses:
 *
 *   1. checkout shows the school's Pay ID + exact USDT amount + a payment code
 *      (= our transaction id) the buyer puts in the transfer note,
 *   2. the client polls /api/payments/binance-personal/verify,
 *   3. the verify endpoint / reconcile cron match recent incoming transfers
 *      against pending transactions (lib/payments/binance-personal-reconcile.ts)
 *      and flip them → successful (the after_transaction_update trigger
 *      creates the entitlements).
 *
 * The school's API key MUST be read-only (no trade/withdraw scopes) and should
 * be IP-restricted to the server — the confirm path only ever reads history.
 *
 * Signing: the /sapi endpoints use the standard Binance spot-API scheme —
 * HMAC-SHA256 over the query string, `X-MBX-APIKEY` header. This is NOT the
 * merchant Binance Pay scheme (HMAC-SHA512 over timestamp\nnonce\nbody\n).
 */

import {
  IPaymentProvider,
  PaymentProvider,
  ProviderCapabilities,
  PaymentProduct,
  PaymentPrice,
  CreateProductParams,
  CreatePriceParams,
  UpdateProductParams,
  UpdatePriceParams,
  CreateCheckoutParams,
  CheckoutSession,
  NormalizedBillingEvent,
} from './types'
import crypto from 'crypto'

const BASE_URL = 'https://api.binance.com'

/** One incoming Pay transfer, normalized from /sapi/v1/pay/transactions. */
export interface BinancePayTransfer {
  /** Binance's unique id for the transfer — consumed via provider_charge_id. */
  orderId: string
  /** Positive = funds received. Major units (e.g. 25.5 USDT). */
  amount: number
  currency: string
  /** Free-text note the sender attached (where the payment code goes). */
  note: string
  /** Transfer timestamp (ms epoch). */
  transactionTime: number
}

/**
 * Normalize the raw /sapi/v1/pay/transactions payload into BinancePayTransfer
 * rows, keeping only incoming (amount > 0) transfers. Exported for tests.
 * Field names are parsed defensively — Binance has shipped both `orderId` and
 * `transactionId`, and the note under `note` / `remark`.
 */
export function normalizePayHistory(raw: unknown): BinancePayTransfer[] {
  const data = (raw as { data?: unknown[] })?.data
  if (!Array.isArray(data)) return []
  const transfers: BinancePayTransfer[] = []
  for (const item of data) {
    const row = item as Record<string, unknown>
    const orderId = String(row.orderId ?? row.transactionId ?? '')
    const amount = Number(row.amount)
    if (!orderId || !Number.isFinite(amount) || amount <= 0) continue
    transfers.push({
      orderId,
      amount,
      currency: String(row.currency ?? ''),
      note: String(row.note ?? row.remark ?? ''),
      transactionTime: Number(row.transactionTime ?? 0),
    })
  }
  return transfers
}

/** Sign a /sapi query string with the account's secret. Exported for tests. */
export function signSapiQuery(query: string, apiSecret: string): string {
  return crypto.createHmac('sha256', apiSecret).update(query).digest('hex')
}

export class BinancePersonalProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'binance_personal'

  // Mirror of PROVIDER_CAPABILITIES.binance_personal (types.ts) — poll-confirmed
  // manual transfer: we own the period, nothing is hosted, refunds are manual.
  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
    createsCatalog: false,
    supportsPlanChange: false,
  }

  private readonly apiKey?: string
  private readonly apiSecret?: string

  /**
   * Credentials are PER TENANT (the school's own account), so the factory
   * constructs this credential-less for checkout (which never calls Binance);
   * the verify endpoint and reconcile cron construct it with the tenant's
   * decrypted key from tenant_payment_wallets.credentials.
   */
  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey
    this.apiSecret = apiSecret
  }

  /** Amounts are decimal USDT (major units) end to end. */
  convertAmount(amount: number, _fromUnit: 'base' | 'major'): number {
    return amount
  }

  // ---------------------------------------------------------------------------
  // Checkout — no provider call; just the manual-transfer instructions
  // ---------------------------------------------------------------------------

  /**
   * Nothing is created on Binance's side: the "session" is a set of transfer
   * instructions. The checkout route resolves the school's Pay ID into
   * `destinationAccount`; the payment code is our transaction id (`reference`),
   * which the buyer must put in the transfer note so the verify poll can match
   * the payment deterministically.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
    if (!params.destinationAccount) {
      throw new Error('School has not configured a Binance Pay ID')
    }
    return {
      kind: 'instructions',
      reference: params.reference,
      instructions: {
        payId: params.destinationAccount,
        amount: params.amount,
        currency: 'USDT',
        code: params.reference,
      },
    }
  }

  // ---------------------------------------------------------------------------
  // Pay history — the confirmation source (read-only, signed)
  // ---------------------------------------------------------------------------

  /**
   * Fetch recent Pay transfers for the account. Weight-heavy on Binance's side
   * (UID weight ~3000) — callers batch per tenant and rate-limit.
   */
  async listPayTransactions(opts?: {
    startTime?: number
    endTime?: number
    limit?: number
  }): Promise<BinancePayTransfer[]> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Binance personal API credentials are required to read Pay history')
    }
    const params = new URLSearchParams()
    if (opts?.startTime) params.set('startTime', String(opts.startTime))
    if (opts?.endTime) params.set('endTime', String(opts.endTime))
    params.set('limit', String(Math.min(opts?.limit ?? 100, 100)))
    params.set('recvWindow', '10000')
    params.set('timestamp', String(Date.now()))
    const query = params.toString()
    const signature = signSapiQuery(query, this.apiSecret)

    const res = await fetch(`${BASE_URL}/sapi/v1/pay/transactions?${query}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': this.apiKey },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Binance Pay history request failed (${res.status}): ${body.slice(0, 200)}`)
    }
    return normalizePayHistory(await res.json())
  }

  // ---------------------------------------------------------------------------
  // Webhooks — none (poll-confirmed, like Solana)
  // ---------------------------------------------------------------------------

  async verifyWebhook(_rawBody: string, _headers: Record<string, string>): Promise<boolean> {
    return false
  }

  async normalizeWebhookEvent(_rawBody: string): Promise<NormalizedBillingEvent | null> {
    return null
  }

  // ---------------------------------------------------------------------------
  // Catalog — none (createsCatalog: false; products/prices live only in our DB)
  // ---------------------------------------------------------------------------

  async createProduct(_params: CreateProductParams): Promise<PaymentProduct> {
    throw new Error('Binance personal accounts have no product catalog API')
  }
  async updateProduct(_productId: string, _params: UpdateProductParams): Promise<PaymentProduct> {
    throw new Error('Binance personal accounts have no product catalog API')
  }
  async getProduct(_productId: string): Promise<PaymentProduct> {
    throw new Error('Binance personal accounts have no product catalog API')
  }
  async archiveProduct(_productId: string): Promise<void> {
    throw new Error('Binance personal accounts have no product catalog API')
  }
  async restoreProduct(_productId: string): Promise<void> {
    throw new Error('Binance personal accounts have no product catalog API')
  }
  async createPrice(_params: CreatePriceParams): Promise<PaymentPrice> {
    throw new Error('Binance personal accounts have no price catalog API')
  }
  async updatePrice(_priceId: string, _params: UpdatePriceParams): Promise<PaymentPrice> {
    throw new Error('Binance personal accounts have no price catalog API')
  }
  async getPrice(_priceId: string): Promise<PaymentPrice> {
    throw new Error('Binance personal accounts have no price catalog API')
  }
  async archivePrice(_priceId: string): Promise<void> {
    throw new Error('Binance personal accounts have no price catalog API')
  }
}
