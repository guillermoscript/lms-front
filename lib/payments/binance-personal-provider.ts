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

const DEFAULT_BASE_URL = 'https://api.binance.com'

/** `http(s)://` on 127.0.0.0/8, ::1 or localhost — nothing else can be a test stub. */
function isLoopbackOrigin(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname.replace(/^\[|\]$/g, '') // an IPv6 literal arrives bracketed
  return host === 'localhost' || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
}

let warnedNonLoopback = false

/**
 * Binance's API host. Overridable so the settlement E2E can point the server at
 * a local stub; production never sets it. Read per call, not at module scope,
 * because the value must follow the server process's env.
 *
 * LOOPBACK ONLY, and that is a security boundary, not tidiness: the request this
 * host receives carries the school's DECRYPTED Binance API key in `X-MBX-APIKEY`
 * plus a valid HMAC over the query. A stray non-loopback value — a copy-pasted
 * Dokploy env, a leaked `.env.local` on a self-hosted install, a bad Actions
 * variable — would ship every tenant's credential to it on each verify/reconcile
 * poll, silently. So anything that is not loopback is ignored (warned once) and
 * we fall back to Binance. A `NODE_ENV !== 'production'` guard would NOT work
 * here: CI runs the spec against `next start`, i.e. NODE_ENV=production.
 *
 * A trailing slash is trimmed — the callers interpolate `${baseUrl()}/sapi/…`.
 */
function baseUrl(): string {
  const override = process.env.BINANCE_PAY_API_BASE
  if (!override) return DEFAULT_BASE_URL
  if (!isLoopbackOrigin(override)) {
    if (!warnedNonLoopback) {
      warnedNonLoopback = true
      console.warn(
        `[binance-personal] ignoring non-loopback BINANCE_PAY_API_BASE (${override}) — using ${DEFAULT_BASE_URL}. ` +
          'This override exists only to point the settlement E2E at a local stub; it must never be set on a deployed environment.',
      )
    }
    return DEFAULT_BASE_URL
  }
  return override.replace(/\/+$/, '')
}

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
    supportsPlatformBillingCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
    createsCatalog: false,
    supportsPlanChange: false,
    supportsCustomerPortal: false, // personal Pay account — no merchant portal at all
    supportsProrationPreview: false, // no mid-period quote API
    supportsScheduledCancellation: false, // no native cancel-at-period-end — see ProviderCapabilities
    bearsPlatformFee: false, // money never reaches a platform account
    settlesToPlatformAccount: false,
    requiresConnectedAccount: false, // the school's own Pay ID, saved in Settings — no onboarding flow
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

    const res = await fetch(`${baseUrl()}/sapi/v1/pay/transactions?${query}&signature=${signature}`, {
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
