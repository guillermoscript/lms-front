/**
 * Payment Provider Types
 * Defines interfaces for multiple payment providers (Stripe, PayPal, Binance, etc.)
 */

export type PaymentProvider = 'stripe' | 'paypal' | 'binance' | 'binance_personal' | 'manual' | 'lemonsqueezy' | 'solana' | 'solana_subs'

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

/**
 * Params for moving an existing subscription to a different plan/price in place
 * (capability-gated by `supportsPlanChange`). The provider swaps the recurring
 * item/variant on the SAME subscription object — the provider subscription id is
 * unchanged — and settles the mid-period difference via proration.
 */
export interface UpdateSubscriptionParams {
  /** Provider price/variant id of the TARGET plan (provider_price_id on the plan). */
  newProviderPriceId: string
  /**
   * How to settle the mid-period billing difference. Defaults to the provider's
   * standard prorated behavior (`create_prorations` on Stripe).
   */
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice'
  metadata?: Record<string, string>
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
  /**
   * Provider can host a checkout page for a subscription billed to the
   * PLATFORM's own account and hand back a redirect URL — the school → platform
   * loop (#600/#603).
   *
   * Deliberately NOT the same flag as `supportsHostedCheckout`, which describes
   * the student → school checkout SHAPE. Stripe is `false` there because we use
   * Connect + PaymentIntents/Elements and confirm client-side (`client_secret`),
   * yet Stripe Checkout Sessions on the platform account are exactly this
   * ability. Collapsing the two would have made platform billing reject the one
   * provider it currently works with.
   *
   * Gates `POST /api/billing/checkout` and, with it, `CreateCheckoutParams.hosted`.
   */
  supportsPlatformBillingCheckout: boolean
  /** Provider can issue programmatic refunds. */
  supportsRefunds: boolean
  /** Provider is the legal seller and remits tax (Lemon Squeezy / Paddle). */
  isMerchantOfRecord: boolean
  /** WE own the billing period (cash, bank transfer, basic crypto/Solana Pay). */
  selfManagedPeriod: boolean
  /**
   * Provider exposes an API to create products/prices in its OWN catalog, so we
   * auto-generate provider_product_id / provider_price_id at create time
   * (Stripe/PayPal). If false, there is no API catalog to create against:
   *  - Merchant-of-Record (Lemon Squeezy) → catalog lives in their dashboard;
   *    the admin pastes the variant id into provider_price_id.
   *  - Catalog-less (Solana/manual/binance) → no provider ids at all.
   * The create/update actions branch on THIS, never on provider identity.
   */
  createsCatalog: boolean
  /**
   * Provider can move an EXISTING subscription to a different plan/price in place
   * (native item/variant swap with proration) via `updateSubscription`
   * (Stripe/LS/Paddle). If false, a plan change is handled app-side as a
   * supersession (cancel the old sub, activate the new plan) rather than a
   * provider-native swap. The plan-change flow (#463) branches on THIS.
   */
  supportsPlanChange: boolean
  /**
   * The platform takes its cut (`revenue_splits.platform_percentage`) on sales
   * through this provider.
   *
   * True wherever a platform account is actually in the money path: Stripe
   * (`application_fee_amount` on the Connect charge), the platform-settled trio
   * (PayPal / Lemon Squeezy / Binance — the platform holds 100% and pays the
   * school out manually), and Solana (split on-chain from `revenue_splits`).
   *
   * False for `manual` and `binance_personal`, where the buyer pays the school's
   * own account directly and the platform never touches the money, so there is
   * no mechanism by which it could take a fee.
   *
   * This replaces `revenue_splits.applies_to_providers` (issue #547), which
   * stored the labels 'stripe'/'manual' rather than provider slugs — so a
   * PayPal sale fell outside it and was charged 0% by the school-facing revenue
   * screens while `getPayoutsOwed` applied the full split to the same row. Two
   * shipped screens differing by the entire platform fee. Whether a fee is taken
   * is a property of the PROVIDER, not of the tenant; it now lives here only.
   * `supabase/migrations/20260727130000_*.sql` mirrors this list in SQL for
   * `get_platform_revenue` — the two must stay in step.
   */
  bearsPlatformFee: boolean
  /**
   * Provider settles 100% of every sale into the PLATFORM's own account —
   * no per-tenant connected account (unlike Stripe Connect) and no on-chain
   * split (unlike Solana). The school's share must be paid out manually
   * (see `lib/payments/payouts-owed.ts`) rather than arriving automatically.
   */
  settlesToPlatformAccount: boolean
}

/**
 * Static capability table, keyed by provider slug. Lets credential-free callers
 * (e.g. the expiry cron) branch on ability WITHOUT instantiating a provider
 * (which requires API keys). Must stay in sync with each provider class's
 * `capabilities`.
 */
export const PROVIDER_CAPABILITIES: Record<PaymentProvider, ProviderCapabilities> = {
  stripe: {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: false,
    supportsPlatformBillingCheckout: true,  // Checkout Sessions on the platform account (not Connect)
    supportsRefunds: true,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
    createsCatalog: true,
    supportsPlanChange: true,
    bearsPlatformFee: true, // application_fee_amount on the Connect charge
    settlesToPlatformAccount: false, // school's own Connect account
  },
  paypal: {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: true,
    supportsPlatformBillingCheckout: false, // TODO(#479): flip once proven against real credentials
    supportsRefunds: true,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
    createsCatalog: true,
    supportsPlanChange: false,
    bearsPlatformFee: true, // platform holds 100%, school paid out manually
    settlesToPlatformAccount: true, // one global PAYPAL_CLIENT_ID/SECRET — no per-tenant merchant onboarding
  },
  lemonsqueezy: {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: true,
    supportsPlatformBillingCheckout: true, // Merchant of Record — hosted page, remits VAT for us
    supportsRefunds: true,
    isMerchantOfRecord: true,
    selfManagedPeriod: false,
    createsCatalog: false,
    supportsPlanChange: true,
    bearsPlatformFee: true, // platform holds 100%, school paid out manually
    settlesToPlatformAccount: true, // one global LS store — Merchant of Record, single platform-owned account
  },
  solana: {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsPlatformBillingCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
    createsCatalog: false,
    supportsPlanChange: false,
    bearsPlatformFee: true, // platform wallet receives its slice in the same on-chain tx
    settlesToPlatformAccount: false, // split on-chain in one tx (lib/payments/solana-split.ts)
  },
  // Native on-chain auto-pull subscriptions (solana-program/subscriptions). WE
  // drive renewal via an off-chain crank cron (no provider webhook, no on-chain
  // scheduler), so it is NOT cron-EXPIRED — the crank renews it. Hence
  // supportsNativeSubscriptions:true (auto-charge) with emitsRenewalWebhooks:false.
  solana_subs: {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsPlatformBillingCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
    createsCatalog: false,
    // On-chain auto-pull is a fixed-amount delegation; changing plan requires a
    // fresh subscriber-signed delegation, so there is no in-place swap.
    supportsPlanChange: false,
    bearsPlatformFee: true, // platform wallet receives its slice on each pull
    settlesToPlatformAccount: false, // split on-chain per pull (lib/payments/solana-subscription-pull.ts)
  },
  manual: {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsPlatformBillingCheckout: false,      // settles via platform_payment_requests, no hosted page
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
    createsCatalog: false,
    supportsPlanChange: false,
    bearsPlatformFee: false, // money never reaches a platform account
    settlesToPlatformAccount: false, // bank transfer straight to the school's own account
  },
  // Binance Pay: hosted crypto checkout (USDT-denominated). No native
  // recurring billing — plan purchases are one-time payments whose period WE
  // manage (selfManagedPeriod: true → the expiry cron lapses unpaid rows),
  // same model as Solana one-time.
  binance: {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: true,
    supportsPlatformBillingCheckout: false,     // student-side rail, not a SaaS subscription rail
    supportsRefunds: true,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
    createsCatalog: false,
    supportsPlanChange: false,
    bearsPlatformFee: true, // platform holds 100%, school paid out manually
    settlesToPlatformAccount: true, // one global BINANCE_PAY_API_KEY/SECRET merchant account — no sub-merchant split
  },
  // Binance Pay on a PERSONAL (non-merchant, no-KYB) account. No hosted
  // checkout and no webhooks: the buyer transfers manually to the school's
  // Pay ID and we confirm by polling the account's read-only Pay history
  // (GET /sapi/v1/pay/transactions) — same poll-confirmed model as Solana
  // one-time. Refunds are manual transfers (personal accounts have no refund
  // API).
  binance_personal: {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsPlatformBillingCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
    createsCatalog: false,
    supportsPlanChange: false,
    bearsPlatformFee: false, // money never reaches a platform account
    settlesToPlatformAccount: false, // per-tenant Pay ID — straight to the school's own account
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
  /**
   * Ask the provider for a HOSTED checkout page (a redirect URL) instead of its
   * inline / client-confirmed flow. Capability-gated by
   * `supportsPlatformBillingCheckout`; ignored by providers whose only checkout
   * is already a redirect.
   *
   * Exists because the same provider can offer both shapes: Stripe's student
   * checkout is a Connect PaymentIntent confirmed with Elements, while platform
   * billing needs a Checkout Session on our own account (#603).
   */
  hosted?: boolean
  successUrl?: string
  cancelUrl?: string
  /**
   * The tenant's own origin (protocol + host), derived from the incoming
   * request rather than the single global `NEXT_PUBLIC_APP_URL` env var —
   * multi-tenant Solana Pay tx-request links must point back at the school's
   * subdomain, not whichever host that env var happens to be pinned to.
   * Falls back to `NEXT_PUBLIC_APP_URL` in contexts with no request (scripts).
   */
  baseUrl?: string
  metadata?: Record<string, string>
}

export interface CheckoutSession {
  /**
   * - 'redirect'      → send the buyer to `url` (LS, MercadoPago, PayPal)
   * - 'client_secret' → confirm client-side (Stripe PaymentIntent / Elements)
   * - 'qr'            → render `url` as a QR / payment request (Solana Pay)
   * - 'instructions'  → show `instructions` (manual transfer to a receiving
   *                     account + note code) and poll a verify endpoint
   *                     (binance_personal)
   * - 'offline'       → no online step; a payment_request row drives it (cash)
   */
  kind: 'redirect' | 'client_secret' | 'qr' | 'instructions' | 'offline'
  url?: string
  clientSecret?: string
  /** Our correlation id (echo of CreateCheckoutParams.reference). */
  reference: string
  /** Provider's own session/intent id, if any. */
  providerRef?: string
  expiresAt?: Date
  /** Manual-transfer display payload (kind: 'instructions'). */
  instructions?: {
    /** Receiving account the buyer transfers to (e.g. Binance Pay ID). */
    payId: string
    /** Exact amount to send, in `currency`. */
    amount: number
    currency: string
    /** Code the buyer must put in the transfer note (= our transaction id). */
    code: string
  }
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

/**
 * The lifecycle state a subscription is in, as reported by the event that
 * carries one. Mirrors the `platform_subscriptions.status` CHECK
 * (`20260217040000_platform_billing.sql`) rather than any provider's own
 * vocabulary, so a provider adapter has to map INTO it.
 *
 * `BillingEventType` alone cannot carry this: it has one `subscription.activated`
 * for what the platform loop must distinguish as `active` vs `trialing`, and no
 * member at all for `incomplete` / `unpaid`. The student dispatcher derives
 * status from the event type and ignores this field.
 */
export const SUBSCRIPTION_LIFECYCLE_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
] as const

export type SubscriptionLifecycleStatus = (typeof SUBSCRIPTION_LIFECYCLE_STATUSES)[number]

export interface NormalizedBillingEvent {
  type: BillingEventType
  /** Provider's own unique event id — the idempotency key for webhook_events. */
  providerEventId?: string
  providerSubscriptionId?: string
  providerPaymentId?: string
  // -------------------------------------------------------------------------
  // Subscription detail (#603). All optional and all ignored by the student
  // dispatcher — platform billing stores a richer row than the student loop
  // does (interval, both period bounds, the cancel schedule, the customer id),
  // and re-fetching them from the provider inside the dispatcher would put
  // provider identity back into the applier.
  // -------------------------------------------------------------------------
  /** Provider's customer id (`tenant_billing_customers.provider_customer_id`). */
  providerCustomerId?: string
  /** Provider price/variant the subscription is now billed on. */
  providerPriceId?: string
  /**
   * Provider's id for the billable line the price sits on (Stripe subscription
   * item). Needed to swap the price back on an over-limit downgrade revert.
   */
  providerSubscriptionItemId?: string
  /** Start of the period this event reports. */
  periodStart?: Date
  /** Billing cadence implied by the subscription's current price. */
  interval?: 'monthly' | 'yearly'
  /** Current lifecycle state, where the event reports one. */
  subscriptionStatus?: SubscriptionLifecycleStatus
  /** A cancel is scheduled for the end of the current period. */
  cancelAtPeriodEnd?: boolean
  /** When the cancel was requested, if one was. */
  canceledAt?: Date
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
  /**
   * Money moved by this event, in MAJOR units (dollars, not cents) of
   * `currency` — normalized by the provider's own `normalizeWebhookEvent`, so
   * `dispatchBillingEvent` never has to know a provider's unit conventions
   * (Lemon Squeezy reports cents, PayPal decimal strings, Binance decimals).
   *
   * Set on `refund.succeeded`, where it is the amount of THIS refund — not the
   * running total, which the dispatcher accumulates itself. ABSENT means "the
   * provider did not tell us", which the dispatcher reads as a FULL refund: the
   * behaviour before issue #547, and the conservative direction when the figure
   * is unknown.
   */
  amount?: number
  /**
   * ISO currency of `amount`, lowercase (e.g. 'usd'). The dispatcher discards
   * `amount` when this disagrees with the transaction's own currency rather than
   * converting — a wrong-currency figure applied to a balance moves real money.
   */
  currency?: string
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
  additionalConfig?: Record<string, unknown>
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
  // Reverse a scheduled cancel-at-period-end before the period ends. Providers
  // that scheduled the cancel on their side (Stripe, Lemon Squeezy) must clear it
  // here — a DB-only "reactivate" would leave the provider still set to cancel and
  // the subscription would lapse anyway.
  reactivateSubscription?(providerSubId: string): Promise<void>
  getSubscription?(providerSubId: string): Promise<ProviderSubscription>
  // Move an existing subscription to a different plan/price in place, with
  // proration (capability-gated by supportsPlanChange — Stripe/LS). Providers
  // without a native swap omit this; the plan-change flow supersedes app-side.
  updateSubscription?(providerSubId: string, params: UpdateSubscriptionParams): Promise<ProviderSubscription>

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
