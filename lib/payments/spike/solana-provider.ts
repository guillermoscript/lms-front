/**
 * SPIKE STUB — Solana Pay adapter (reference example #2).
 *
 * NOT wired into any live flow. Demonstrates a SELF-MANAGED-PERIOD provider:
 * Solana Pay (the spec) has NO native recurring billing — it does one-time
 * transfers via a payment-request URL / QR code, confirmed ON-CHAIN. So:
 *   - capabilities.supportsNativeSubscriptions = false
 *   - capabilities.emitsRenewalWebhooks        = false → WE own the period; a
 *     daily cron expires lapsed subscriptions, and a "renewal" is just a new
 *     one-time payment that extends current_period_end.
 *   - capabilities.selfManagedPeriod           = true
 *   - checkout.kind = 'qr'  (render the solana: URL as a QR code)
 *
 * There is no HMAC webhook. "Confirmation" is polling the chain for our unique
 * `reference` key: getSignaturesForAddress(reference) — once a signature appears
 * and the transfer matches recipient+amount+mint, the payment is confirmed.
 *
 * For TRUE crypto recurring (auto-pull), a separate adapter would wrap Helio or
 * the Solana native subscription program; that one WOULD set
 * supportsNativeSubscriptions=true and emit renewal events. Kept separate so the
 * simple one-time path stays simple.
 *
 * Spec: https://docs.solanapay.com/spec  ·  Native subs: https://solana.com/news/subscriptions-and-allowances
 *
 * To make this real (per docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md §8):
 *   1. build the solana: transfer-request URL in createCheckoutSession (recipient,
 *      amount, spl-token=USDC mint, reference, label, memo)
 *   2. add a confirmation poller (or a /verify endpoint) that calls
 *      getSignaturesForAddress(reference) and, on match, inserts the successful
 *      transaction (→ handle_new_subscription) and sets current_period_end
 *   3. add 'solana' to PaymentProvider union + DB CHECK + factory + .env
 *      (SOLANA_RPC_URL, SOLANA_RECIPIENT, SOLANA_USDC_MINT)
 */

import type {
  CreatePriceParams,
  CreateProductParams,
  PaymentPrice,
  PaymentProduct,
  UpdatePriceParams,
  UpdateProductParams,
} from '../types'
import type {
  CheckoutSession,
  CreateCheckoutParams,
  IBillingProvider,
  NormalizedBillingEvent,
  ProviderCapabilities,
} from './billing-contract'

const todo = (method: string): never => {
  throw new Error(`[spike] SolanaProvider.${method} not implemented yet`)
}

export class SolanaProvider implements IBillingProvider {
  readonly provider = 'solana' as const

  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsRefunds: false, // on-chain refunds are manual, out of band
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
  }

  // Solana Pay amounts are decimal token units (e.g. 9.99 USDC), not cents.
  // We keep "major" units and let the URL builder format decimals.
  convertAmount(amount: number, _fromUnit: 'base' | 'major'): number {
    return amount
  }

  // --- Catalog: there is no remote catalog; products/prices live only in our DB
  //     (same approach as the manual provider). Return local placeholder ids. ---
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
  async updateProduct(id: string, params: UpdateProductParams): Promise<PaymentProduct> {
    return {
      id,
      name: params.name ?? '',
      description: params.description ?? '',
      amount: 0,
      currency: 'usdt',
      metadata: params.metadata,
    }
  }
  async getProduct(id: string): Promise<PaymentProduct> {
    return { id, name: 'Solana Product', description: '', amount: 0, currency: 'usdt' }
  }
  async archiveProduct(_id: string): Promise<void> {
    /* DB-only */
  }
  async restoreProduct(_id: string): Promise<void> {
    /* DB-only */
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
  async updatePrice(id: string, params: UpdatePriceParams): Promise<PaymentPrice> {
    return { id, productId: '', amount: 0, currency: 'usdt', type: 'one_time', metadata: params.metadata }
  }
  async getPrice(id: string): Promise<PaymentPrice> {
    return { id, productId: '', amount: 0, currency: 'usdt', type: 'one_time' }
  }
  async archivePrice(_id: string): Promise<void> {
    /* DB-only */
  }

  // --- Checkout: build a Solana Pay transfer-request URL, render as QR. ---
  async createCheckoutSession(_params: CreateCheckoutParams): Promise<CheckoutSession> {
    // Real:
    //   const reference = Keypair.generate().publicKey  // unique on-chain marker
    //   const url = encodeURL({ recipient, amount, splToken: USDC_MINT,
    //                           reference, label, message })
    //   persist reference against our internal `params.reference`
    //   return { kind: 'qr', url: url.toString(), reference: params.reference,
    //            providerRef: reference.toBase58() }
    return todo('createCheckoutSession')
  }

  // No native subscription engine: createSubscription/cancelSubscription are
  // intentionally absent. The DB row is the source of truth; "cancel" just stops
  // future renewals (the period is never auto-charged), and the capability-aware
  // cron flips the row to 'expired' when current_period_end lapses.

  // --- "Webhook": Solana has no signed callback. Confirmation is on-chain. ---
  async verifyWebhook(_rawBody: string, _headers: Record<string, string>): Promise<boolean> {
    // No HMAC. Authenticity comes from the chain: only a real on-chain transfer
    // carrying our `reference` can confirm payment. The generic webhook route
    // does not apply to Solana — confirmation flows through a poller/verify
    // endpoint instead (see normalizeWebhookEvent note).
    return false
  }

  async normalizeWebhookEvent(_rawBody: string): Promise<NormalizedBillingEvent | null> {
    // Not driven by inbound webhooks. Instead a confirmation poller calls
    // getSignaturesForAddress(reference); on a matching, finalized transfer it
    // synthesizes { type: 'payment.succeeded', reference, providerPaymentId: sig }
    // and feeds the same internal dispatcher. Returning null here signals "this
    // provider is not webhook-driven."
    return null
  }
}
