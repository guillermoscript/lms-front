/**
 * Native Solana auto-pull Subscriptions Provider (issue #280, Phase 6).
 *
 * Unlike `solana` (one-time split payment), `solana_subs` uses the on-chain
 * Subscriptions program (solana-program/subscriptions): the buyer authorizes a
 * delegated, capped auto-pull, and an off-chain crank cron renews each period.
 *
 * Checkout is a Solana Pay TRANSACTION request: the QR encodes a link to our
 * `/api/payments/solana/subscribe-tx` endpoint, which returns the unsigned
 * SUBSCRIBE transaction (init authority + subscribe) for the wallet to sign.
 * Confirmation flows through `/api/payments/solana/verify` (branch for
 * `solana_subs`): findReference proves the subscribe tx landed, then we read the
 * on-chain SubscriptionDelegation and fire the first split charge.
 *
 * Capabilities: native subscriptions (auto-charge) WITHOUT a provider webhook —
 * WE drive renewal via the crank cron, so it must NOT be cron-EXPIRED. No hosted
 * checkout, no programmatic refunds.
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

export class SolanaSubscriptionsProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'solana_subs'

  /**
   * Native on-chain auto-pull subscriptions. The auto-charge is driven by an
   * off-chain crank cron (no provider webhook, no on-chain scheduler), so the
   * row is NOT cron-expired — the crank renews it. Mirrors
   * PROVIDER_CAPABILITIES.solana_subs.
   */
  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
    createsCatalog: false,
    supportsPlanChange: false,
  }

  /**
   * No required configuration: receiving wallets are resolved per request (school
   * from tenant_payment_wallets, platform from env) inside the subscribe-tx +
   * verify routes; the puller keypair / RPC are read there too.
   */
  constructor() {
    /* nothing required */
  }

  /**
   * Solana amounts are decimal token units (e.g. 9.99 USDC), NOT cents. The
   * checkout route passes the plan price directly, so return it unchanged.
   */
  convertAmount(amount: number, _fromUnit: 'base' | 'major'): number {
    return amount
  }

  // ---------------------------------------------------------------------------
  // Checkout — Solana Pay TRANSACTION request pointing at /subscribe-tx
  // ---------------------------------------------------------------------------

  /**
   * Build a Solana Pay transaction-request URL pointing at our /subscribe-tx
   * endpoint. A fresh on-chain reference is generated and returned as
   * `providerRef`; the checkout route stores it on the transaction so the
   * subscribe tx can carry it (locating the tx later) and /verify can confirm it
   * with findReference. The link carries our internal reference (transaction id)
   * so /subscribe-tx loads the right pending transaction.
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
        throw new Error('baseUrl or NEXT_PUBLIC_APP_URL is required for Solana subscriptions checkout')
      }
      // The on-chain marker the subscribe tx must include so we can find it.
      // It is ALSO the lookup key the QR carries: a random 32-byte pubkey (vs the
      // sequential transaction_id), so a third party cannot spray /subscribe-tx
      // against guessable pending ids to hijack the captured subscriber.
      const reference = generateReference()

      const link = new URL(`${appUrl}/api/payments/solana/subscribe-tx?reference=${reference}`)
      const url = encodeURL({ link })

      return {
        kind: 'qr',
        url: url.toString(),
        reference: params.reference,
        providerRef: reference, // base58 reference pubkey — stored on the tx
      }
    } catch (error) {
      throw new Error(
        `SolanaSubscriptions createCheckoutSession failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Webhooks — not applicable (confirmation is on-chain via /verify)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Cancellation — cannot happen server-side
  // ---------------------------------------------------------------------------

  /**
   * Revoking the on-chain auto-pull delegation requires the SUBSCRIBER's wallet
   * signature (the Subscriptions program's `cancel` instruction is signed by the
   * subscriber). The server only holds the puller/merchant key, so it CANNOT
   * revoke the delegation on the student's behalf. Throwing here — rather than
   * silently no-oping — is deliberate: it forces the admin cancel action to
   * surface the partial failure instead of reporting a clean success while the
   * delegation is still live and pullable (issue #460).
   *
   * Cancelling still neutralizes the money leak: the crank refuses to charge any
   * row whose DB status is not `active` (see decidePullAction). The student
   * revokes the delegation itself from the billing page (`/api/payments/solana/
   * cancel-tx` → wallet sign → `/api/payments/solana/cancel-verify`).
   */
  async cancelSubscription(_providerSubId: string, _immediate: boolean): Promise<void> {
    throw new Error(
      'solana_subs: the on-chain auto-pull delegation cannot be revoked server-side — it requires the subscriber\'s wallet signature. The subscription has been canceled in our records (the crank will not charge it), but the student must revoke the delegation from their wallet on the billing page.',
    )
  }

  /**
   * Reactivation is not possible server-side either: once the subscriber has
   * revoked the on-chain delegation, only they can re-authorize auto-pull by
   * subscribing again from their wallet. Throwing keeps the caller honest rather
   * than reporting a renewal that will never be charged.
   */
  async reactivateSubscription(_providerSubId: string): Promise<void> {
    throw new Error(
      'solana_subs: auto-pull cannot be reactivated server-side — the subscriber must re-subscribe from their wallet to re-authorize the on-chain delegation.',
    )
  }

  /**
   * No signed inbound webhook. Authenticity comes from the chain: a real
   * subscribe tx carrying our unique reference plus an existing on-chain
   * SubscriptionDelegation. Always returns `false` so the unified webhook route
   * skips this provider.
   */
  async verifyWebhook(_rawBody: string, _headers: Record<string, string>): Promise<boolean> {
    return false
  }

  /**
   * Not webhook-driven — see `/api/payments/solana/verify` (solana_subs branch).
   * Returns `null` to signal "this provider is not webhook-driven."
   */
  async normalizeWebhookEvent(_rawBody: string): Promise<NormalizedBillingEvent | null> {
    return null
  }

  // ---------------------------------------------------------------------------
  // Catalog — no remote catalog; products/prices/plans live only in our DB
  // ---------------------------------------------------------------------------

  async createProduct(params: CreateProductParams): Promise<PaymentProduct> {
    return {
      id: `solana_subs_prod_${params.name.toLowerCase().replace(/\s+/g, '_')}`,
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
    return { id: productId, name: 'Solana Subscription', description: '', amount: 0, currency: 'usdt' }
  }

  async archiveProduct(_productId: string): Promise<void> {
    /* DB-only — no remote catalog */
  }

  async restoreProduct(_productId: string): Promise<void> {
    /* DB-only — no remote catalog */
  }

  async createPrice(params: CreatePriceParams): Promise<PaymentPrice> {
    return {
      id: `solana_subs_price_${params.productId}`,
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
      type: 'subscription',
      metadata: params.metadata,
    }
  }

  async getPrice(priceId: string): Promise<PaymentPrice> {
    return { id: priceId, productId: '', amount: 0, currency: 'usdt', type: 'subscription' }
  }

  async archivePrice(_priceId: string): Promise<void> {
    /* DB-only — no remote catalog */
  }
}
