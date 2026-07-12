/**
 * Solana Pay Provider Implementation (issue #280, Phase 5 + fee split).
 *
 * One-time crypto checkout with a PLATFORM FEE SPLIT. Because a Solana Pay
 * transfer request allows only one recipient, checkout uses a Solana Pay
 * TRANSACTION request: the QR encodes a link to our `/api/payments/solana/tx`
 * endpoint, which returns a transaction with two transfers (school share +
 * platform fee). Confirmation is on-chain via `/api/payments/solana/verify`
 * (custom two-leg verification in `lib/payments/solana-split.ts`).
 *
 * Capabilities: self-managed period (a daily cron expires lapsed rows; a
 * "renewal" is a fresh one-time payment), no native recurring billing, no
 * signed webhook. Refunds are manual/on-chain, out of band.
 *
 * Spec: https://docs.solanapay.com/spec (transaction request)
 */

import { encodeURL } from '@solana/pay'

import {
  IPaymentProvider,
  PaymentProvider,
  PaymentProduct,
  PaymentPrice,
  ProviderCapabilities,
  CreateProductParams,
  UpdateProductParams,
  CreatePriceParams,
  UpdatePriceParams,
  CreateCheckoutParams,
  CheckoutSession,
  NormalizedBillingEvent,
} from './types'
import { generateReference } from './solana-split'

export class SolanaProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'solana'

  /**
   * Solana Pay is a one-time, self-managed-period provider:
   * - No native recurring billing (no auto-pull on subscription schedules).
   * - No signed inbound webhook; confirmation flows through on-chain polling.
   * - Not a hosted-checkout redirect provider; the QR URL is rendered in-app.
   * - On-chain refunds require a manual reverse transfer (out of scope).
   */
  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
    createsCatalog: false,
  }

  private readonly rpcUrl: string
  private readonly usdcMint: string | undefined

  /**
   * @param rpcUrl   - Solana RPC endpoint (e.g. devnet/mainnet URL).
   * @param usdcMint - Optional SPL-token mint; omit for native SOL payments.
   *
   * Note: the receiving wallet is NOT baked in here — the school wallet is
   * resolved per tenant in the /tx + /verify routes (tenant_payment_wallets),
   * and the platform fee wallet from env. This adapter only builds the
   * transaction-request URL; the split transaction itself lives in those routes.
   */
  constructor(rpcUrl: string, usdcMint?: string) {
    this.rpcUrl = rpcUrl
    this.usdcMint = usdcMint
  }

  /**
   * Solana Pay amounts are decimal token units (e.g. 9.99 USDC), NOT cents.
   * The checkout route passes the plan/product price directly, so return it
   * unchanged regardless of `fromUnit`.
   */
  convertAmount(amount: number, _fromUnit: 'base' | 'major'): number {
    return amount
  }

  // ---------------------------------------------------------------------------
  // Checkout — Solana Pay TRANSACTION request (enables the fee split)
  // ---------------------------------------------------------------------------

  /**
   * Build a Solana Pay transaction-request URL pointing at our /tx endpoint.
   *
   * A fresh on-chain reference is generated and returned as `providerRef`; the
   * checkout route stores it on the transaction so the /tx endpoint can attach
   * it (locating the payment later) and /verify can confirm both split legs.
   * The link ALSO carries this same random reference (NOT the sequential
   * transaction_id) — `/tx` is hit anonymously by the wallet app with no way to
   * authenticate, so a guessable id would let anyone enumerate other tenants'
   * pending order amounts and wallet addresses. Mirrors the `solana_subs` flow.
   *
   * Returns `kind: 'qr'`; the checkout UI renders the URL as a QR code.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
    try {
      // Prefer the tenant origin the checkout route derived from the request
      // (correct per-subdomain host); fall back to the global env var for
      // script/CLI contexts that call this with no HTTP request in play.
      const appUrl = params.baseUrl || process.env.NEXT_PUBLIC_APP_URL
      if (!appUrl) {
        throw new Error('baseUrl or NEXT_PUBLIC_APP_URL is required for Solana checkout')
      }
      // The on-chain marker the wallet must include so we can find the payment —
      // also the unguessable lookup key /tx uses to load the pending transaction.
      const reference = generateReference()

      const link = new URL(`${appUrl}/api/payments/solana/tx`)
      link.searchParams.set('reference', reference)
      const url = encodeURL({ link })

      return {
        kind: 'qr',
        url: url.toString(),
        reference: params.reference,
        providerRef: reference, // base58 reference pubkey — stored on the tx
      }
    } catch (error) {
      throw new Error(
        `Solana createCheckoutSession failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Webhooks — not applicable to Solana Pay (confirmation is on-chain)
  // ---------------------------------------------------------------------------

  /**
   * Solana Pay has NO signed inbound webhook. Payment authenticity comes from
   * the chain: only a real on-chain transfer carrying our unique reference (and
   * paying both split legs) confirms a payment. Always returns `false` so the
   * unified webhook route skips this provider; confirmation flows through
   * `/api/payments/solana/verify`.
   */
  async verifyWebhook(_rawBody: string, _headers: Record<string, string>): Promise<boolean> {
    return false
  }

  /**
   * Not webhook-driven — see `/api/payments/solana/verify`, which uses
   * `verifySplitTransfer` to confirm the on-chain split and flip the
   * transaction. Returns `null` to signal "this provider is not webhook-driven."
   */
  async normalizeWebhookEvent(_rawBody: string): Promise<NormalizedBillingEvent | null> {
    return null
  }

  // ---------------------------------------------------------------------------
  // Catalog — no remote catalog; products/prices live only in our DB
  // ---------------------------------------------------------------------------

  async createProduct(params: CreateProductParams): Promise<PaymentProduct> {
    return {
      id: `solana_prod_${params.name.toLowerCase().replace(/\s+/g, '_')}`,
      name: params.name,
      description: params.description,
      amount: 0,
      currency: 'usdt',
      metadata: params.metadata,
    }
  }

  async updateProduct(productId: string, params: UpdateProductParams): Promise<PaymentProduct> {
    return {
      id: productId,
      name: params.name ?? '',
      description: params.description ?? '',
      amount: 0,
      currency: 'usdt',
      metadata: params.metadata,
    }
  }

  async getProduct(productId: string): Promise<PaymentProduct> {
    return { id: productId, name: 'Solana Product', description: '', amount: 0, currency: 'usdt' }
  }

  async archiveProduct(_productId: string): Promise<void> {
    /* DB-only — no remote catalog */
  }

  async restoreProduct(_productId: string): Promise<void> {
    /* DB-only — no remote catalog */
  }

  async createPrice(params: CreatePriceParams): Promise<PaymentPrice> {
    return {
      id: `solana_price_${params.productId}`,
      productId: params.productId,
      amount: params.amount,
      currency: params.currency,
      type: params.type,
      interval: params.interval,
      metadata: params.metadata,
    }
  }

  async updatePrice(priceId: string, params: UpdatePriceParams): Promise<PaymentPrice> {
    return {
      id: priceId,
      productId: '',
      amount: 0,
      currency: 'usdt',
      type: 'one_time',
      metadata: params.metadata,
    }
  }

  async getPrice(priceId: string): Promise<PaymentPrice> {
    return { id: priceId, productId: '', amount: 0, currency: 'usdt', type: 'one_time' }
  }

  async archivePrice(_priceId: string): Promise<void> {
    /* DB-only — no remote catalog */
  }
}
