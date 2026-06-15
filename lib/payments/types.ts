/**
 * Payment Provider Types
 * Defines interfaces for multiple payment providers (Stripe, PayPal, Binance, etc.)
 */

export type PaymentProvider = 'stripe' | 'paypal' | 'binance' | 'manual' | 'lemonsqueezy' | 'solana' | 'solana_subs'

export type Currency = 'usd' | 'eur' | 'btc' | 'eth' | 'usdt'

export type PaymentType = 'one_time' | 'subscription'

export interface PaymentProduct {
  id: string
  name: string
  description: string
  amount: number
  currency: Currency
  metadata?: Record<string, string>
}

export interface PaymentPrice {
  id: string
  productId: string
  amount: number
  currency: Currency
  type: PaymentType
  interval?: 'month' | 'year'
  metadata?: Record<string, string>
}

export interface CreateProductParams {
  name: string
  description: string
  images?: string[]
  metadata?: Record<string, string>
}

export interface CreatePriceParams {
  productId: string
  amount: number // Amount in smallest currency unit (cents, satoshis, etc.)
  currency: Currency
  type: PaymentType
  interval?: 'month' | 'year'
  intervalCount?: number
  metadata?: Record<string, string>
}

export interface UpdateProductParams {
  name?: string
  description?: string
  images?: string[]
  active?: boolean
  metadata?: Record<string, string>
}

export interface UpdatePriceParams {
  active?: boolean
  metadata?: Record<string, string>
}

export interface CreateSubscriptionParams {
  providerPriceId: string
  providerCustomerId: string
  metadata?: Record<string, string>
}

export interface ProviderSubscription {
  id: string
  status: 'active' | 'canceled' | 'past_due'
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

// ---------------------------------------------------------------------------
// Provider-agnostic billing additions (issue #280 / provider-agnostic spike).
// All ADDITIVE: new concepts so providers with different abilities (Stripe vs
// Lemon Squeezy vs Solana Pay vs cash) all fit one API. The app branches on
// capabilities, NEVER on provider identity. See docs/PROVIDER_AGNOSTIC_PAYMENTS_SPIKE.md
// ---------------------------------------------------------------------------

/**
 * Static descriptor of what a provider can do. Lets the app branch on ability,
 * never on provider identity.
 */
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

/**
 * Static capability table, keyed by provider slug. Lets credential-free callers
 * (e.g. the expiry cron) branch on ability WITHOUT instantiating a provider
 * (which requires API keys). Must stay in sync with each provider class's
 * `capabilities`. The unimplemented `binance` slug mirrors a self-managed
 * default so a stray row is cron-expired rather than left active forever.
 */
export const PROVIDER_CAPABILITIES: Record<PaymentProvider, ProviderCapabilities> = {
  stripe: {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: false,
    supportsRefunds: true,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
  },
  paypal: {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: true,
    supportsRefunds: true,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
  },
  lemonsqueezy: {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: true,
    supportsRefunds: true,
    isMerchantOfRecord: true,
    selfManagedPeriod: false,
  },
  solana: {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
  },
  // Native on-chain auto-pull subscriptions (solana-program/subscriptions). WE
  // drive renewal via an off-chain crank cron (no provider webhook, no on-chain
  // scheduler), so it is NOT cron-EXPIRED — the crank renews it. Hence
  // supportsNativeSubscriptions:true (auto-charge) with emitsRenewalWebhooks:false.
  solana_subs: {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
  },
  manual: {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
  },
  binance: {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
  },
}

/** Params for starting a payment (the missing "start a payment" abstraction). */
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
  /** Optional stored customer (Stripe/MP card-on-file). Required for native subs. */
  providerCustomerId?: string
  /**
   * Marketplace split: route funds to this connected account
   * (Stripe Connect `transfer_data.destination`). Omit for non-marketplace
   * providers / Merchant-of-Record.
   */
  destinationAccount?: string
  /**
   * Platform fee as a percent of each charge (Stripe Connect
   * `application_fee_percent` for subscriptions; converted to a fixed
   * `application_fee_amount` for one-time charges). 0–100.
   */
  applicationFeePercent?: number
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

/** Params for ensuring a stored customer (card-on-file providers only). */
export interface EnsureCustomerParams {
  userId: string
  email: string
  name?: string
  metadata?: Record<string, string>
}

/** Every provider webhook collapses to ONE internal vocabulary. */
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
  /** Provider's own unique event id — the idempotency key for webhook_events. */
  providerEventId?: string
  providerSubscriptionId?: string
  providerPaymentId?: string
  /** Our correlation id, recovered from provider metadata. */
  reference?: string
  /**
   * Provider checkout metadata echoed back on the webhook (e.g. our `userId` /
   * `tenantId`). Used to bind a confirmation to the originating buyer/tenant so
   * a signed event can't activate another user's transaction by its id alone.
   */
  metadata?: Record<string, string>
  /** New period end for renewal events (push-renewal providers). */
  periodEnd?: Date
  /** Original payload, preserved for the webhook_events audit row. */
  raw: unknown
}

export interface RefundParams {
  providerPaymentId: string
  amount?: number // omit for full refund
  reason?: string
}

export interface PaymentProviderConfig {
  provider: PaymentProvider
  apiKey: string
  webhookSecret?: string
  environment?: 'test' | 'production'
  additionalConfig?: Record<string, any>
}

/**
 * Base interface that all payment providers must implement
 */
export interface IPaymentProvider {
  readonly provider: PaymentProvider

  /**
   * What this provider can do. The app branches on these flags, never on
   * `provider` identity. Required so every provider declares its abilities.
   */
  readonly capabilities: ProviderCapabilities

  // Product operations
  createProduct(params: CreateProductParams): Promise<PaymentProduct>
  updateProduct(productId: string, params: UpdateProductParams): Promise<PaymentProduct>
  getProduct(productId: string): Promise<PaymentProduct>
  archiveProduct(productId: string): Promise<void>
  restoreProduct(productId: string): Promise<void>

  // Price operations
  createPrice(params: CreatePriceParams): Promise<PaymentPrice>
  updatePrice(priceId: string, params: UpdatePriceParams): Promise<PaymentPrice>
  getPrice(priceId: string): Promise<PaymentPrice>
  archivePrice(priceId: string): Promise<void>

  // Subscription operations (optional — providers without recurring billing,
  // e.g. manual/offline, implement these as no-ops)
  createSubscription?(params: CreateSubscriptionParams): Promise<ProviderSubscription>
  cancelSubscription?(providerSubId: string, immediate: boolean): Promise<void>
  getSubscription?(providerSubId: string): Promise<ProviderSubscription>

  // Checkout (optional — the creation path that stores provider_subscription_id;
  // providers wire this in Phase 2). Capability-gated by supportsHostedCheckout
  // / native subscription support.
  createCheckoutSession?(params: CreateCheckoutParams): Promise<CheckoutSession>

  // Customers (optional — only providers needing card-on-file recurring).
  ensureCustomer?(params: EnsureCustomerParams): Promise<{ providerCustomerId: string }>

  // Webhooks (optional — per-provider verify + normalize; wired in Phase 3).
  verifyWebhook?(rawBody: string, headers: Record<string, string>): Promise<boolean>
  normalizeWebhookEvent?(rawBody: string): Promise<NormalizedBillingEvent | null>

  // Refunds (optional — capability-gated by supportsRefunds).
  refund?(params: RefundParams): Promise<void>

  // Utility
  convertAmount(amount: number, fromUnit: 'base' | 'major'): number
}

/**
 * Result type for operations
 */
export type PaymentResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string }
