/**
 * SPIKE — Proposed provider-agnostic billing contract.
 *
 * This file is NOT wired into any live code path. It is the design target for
 * issue #280 / the provider-agnostic payments spike (see
 * docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md).
 *
 * Intent: GROW the existing `IPaymentProvider` (lib/payments/types.ts) into this
 * `IBillingProvider` over time. Everything here is ADDITIVE and capability-gated:
 *   - products / prices / subscriptions are reused from the existing types
 *   - new concepts (capabilities, checkout sessions, customers, webhook
 *     normalization, refunds) are added so providers with very different
 *     abilities (Stripe vs Lemon Squeezy vs Solana Pay vs cash) all fit one API.
 *
 * Nothing imports this yet. The two reference stubs in this folder implement it
 * to prove the shape compiles and that "add a provider" is a contained change.
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

/**
 * Slugs proposed for new adapters. The production union lives in
 * `lib/payments/types.ts` as `PaymentProvider`; new slugs get added there (and
 * to the DB `payment_provider` CHECK) when an adapter actually lands.
 */
export type BillingProviderSlug =
  | 'stripe'
  | 'paypal'
  | 'manual'
  | 'lemonsqueezy'
  | 'mercadopago'
  | 'solana'

// ---------------------------------------------------------------------------
// 1. Capabilities — lets the app branch on ability, never on provider identity.
// ---------------------------------------------------------------------------

export interface ProviderCapabilities {
  /** Provider charges on a recurring schedule itself (Stripe/LS/Paddle/MP-card). */
  supportsNativeSubscriptions: boolean
  /**
   * Provider sends us a webhook on each renewal/failure/cancel.
   * If true → NEVER expire its subscriptions via cron; the webhook drives state.
   * If false → it is a "self-managed period" provider; we extend the period on
   * confirmed payment and a cron expires lapsed rows.
   */
  emitsRenewalWebhooks: boolean
  /** Provider returns a hosted redirect URL for checkout (LS/MP/PayPal). */
  supportsHostedCheckout: boolean
  /** Provider can issue programmatic refunds. */
  supportsRefunds: boolean
  /** Provider is the legal seller and remits tax (Lemon Squeezy / Paddle). */
  isMerchantOfRecord: boolean
  /** WE own the billing period (cash, bank transfer, basic crypto/Solana Pay). */
  selfManagedPeriod: boolean
}

// ---------------------------------------------------------------------------
// 2. Checkout session — the missing "start a payment" abstraction.
// ---------------------------------------------------------------------------

export interface CreateCheckoutParams {
  /** One-time product purchase or a recurring plan subscription. */
  mode: 'one_time' | 'subscription'
  /** Provider price id (provider_price_id on the product/plan row). */
  providerPriceId: string
  /** Amount in the provider's expected unit; use convertAmount() to prepare. */
  amount: number
  currency: string
  /** Our internal correlation id — must round-trip back on the webhook. */
  reference: string
  /** Optional stored customer (Stripe/MP card-on-file). */
  providerCustomerId?: string
  successUrl?: string
  cancelUrl?: string
  metadata?: Record<string, string>
}

export interface CheckoutSession {
  /**
   * - 'redirect'      → send the buyer to `url` (LS, MercadoPago, PayPal)
   * - 'client_secret' → confirm client-side (Stripe PaymentIntent / Elements)
   * - 'qr'            → render `url` as a QR / payment request (Solana Pay)
   * - 'offline'       → no online step; a payment_request row drives it (cash)
   */
  kind: 'redirect' | 'client_secret' | 'qr' | 'offline'
  url?: string
  clientSecret?: string
  /** Our correlation id (echo of CreateCheckoutParams.reference). */
  reference: string
  /** Provider's own session/intent id, if any. */
  providerRef?: string
  expiresAt?: Date
}

// ---------------------------------------------------------------------------
// 3. Customers (optional — only providers needing card-on-file recurring).
// ---------------------------------------------------------------------------

export interface EnsureCustomerParams {
  userId: string
  email: string
  name?: string
  metadata?: Record<string, string>
}

// ---------------------------------------------------------------------------
// 4. Webhook normalization — every provider event collapses to ONE vocabulary.
// ---------------------------------------------------------------------------

export type BillingEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'subscription.activated'
  | 'subscription.renewed'
  | 'subscription.past_due'
  | 'subscription.canceled'
  | 'subscription.expired'
  | 'refund.succeeded'

export interface NormalizedBillingEvent {
  type: BillingEventType
  providerSubscriptionId?: string
  providerPaymentId?: string
  /** Our correlation id, recovered from provider metadata. */
  reference?: string
  /** New period end for renewal events (push-renewal providers). */
  periodEnd?: Date
  /** Original payload, preserved for the webhook_events audit row. */
  raw: unknown
}

// ---------------------------------------------------------------------------
// 5. Refunds (optional).
// ---------------------------------------------------------------------------

export interface RefundParams {
  providerPaymentId: string
  amount?: number // omit for full refund
  reason?: string
}

// ---------------------------------------------------------------------------
// The contract every provider implements.
// ---------------------------------------------------------------------------

export interface IBillingProvider {
  readonly provider: BillingProviderSlug
  readonly capabilities: ProviderCapabilities

  // --- Catalog (same as today's IPaymentProvider) ---
  createProduct(params: CreateProductParams): Promise<PaymentProduct>
  updateProduct(productId: string, params: UpdateProductParams): Promise<PaymentProduct>
  getProduct(productId: string): Promise<PaymentProduct>
  archiveProduct(productId: string): Promise<void>
  restoreProduct(productId: string): Promise<void>

  createPrice(params: CreatePriceParams): Promise<PaymentPrice>
  updatePrice(priceId: string, params: UpdatePriceParams): Promise<PaymentPrice>
  getPrice(priceId: string): Promise<PaymentPrice>
  archivePrice(priceId: string): Promise<void>

  // --- Checkout (NEW — the creation path that stores provider_subscription_id) ---
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>

  // --- Subscriptions (optional; no-ops for self-managed providers) ---
  createSubscription?(params: CreateSubscriptionParams): Promise<ProviderSubscription>
  cancelSubscription?(providerSubId: string, immediate: boolean): Promise<void>
  getSubscription?(providerSubId: string): Promise<ProviderSubscription>

  // --- Customers (optional) ---
  ensureCustomer?(params: EnsureCustomerParams): Promise<{ providerCustomerId: string }>

  // --- Webhooks (NEW — per-provider verify + normalize) ---
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<boolean>
  normalizeWebhookEvent(rawBody: string): Promise<NormalizedBillingEvent | null>

  // --- Refunds (optional) ---
  refund?(params: RefundParams): Promise<void>

  // --- Utility (same as today) ---
  convertAmount(amount: number, fromUnit: 'base' | 'major'): number
}
