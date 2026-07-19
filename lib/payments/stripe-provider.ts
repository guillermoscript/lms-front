/**
 * Stripe Payment Provider Implementation
 */

import Stripe from 'stripe'
import {
  IPaymentProvider,
  PaymentProvider,
  PaymentProduct,
  PaymentPrice,
  CreateProductParams,
  CreatePriceParams,
  UpdateProductParams,
  UpdatePriceParams,
  CreateSubscriptionParams,
  UpdateSubscriptionParams,
  ProviderSubscription,
  ProviderCapabilities,
  NormalizedBillingEvent,
  CreateCheckoutParams,
  CheckoutSession,
  Currency,
} from './types'

export class StripePaymentProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'stripe'
  // Stripe Connect: native recurring billing + renewal webhooks. We use
  // PaymentIntent/Elements (client_secret), not hosted Checkout, so
  // supportsHostedCheckout is false. Not a Merchant of Record.
  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: true,
    emitsRenewalWebhooks: true,
    supportsHostedCheckout: false,
    supportsRefunds: true,
    isMerchantOfRecord: false,
    selfManagedPeriod: false,
    createsCatalog: true,
    supportsPlanChange: true,
  }
  private stripe: Stripe

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2026-02-25.clover',
    })
  }

  /**
   * Convert amount between base units (cents) and major units (dollars)
   */
  convertAmount(amount: number, fromUnit: 'base' | 'major'): number {
    return fromUnit === 'major' ? Math.round(amount * 100) : amount
  }

  /**
   * Create a product in Stripe
   */
  async createProduct(params: CreateProductParams): Promise<PaymentProduct> {
    try {
      const stripeProduct = await this.stripe.products.create({
        name: params.name,
        description: params.description,
        images: params.images || [],
        metadata: params.metadata || {},
      })

      return {
        id: stripeProduct.id,
        name: stripeProduct.name,
        description: stripeProduct.description || '',
        amount: 0, // Products don't have amounts in Stripe, prices do
        currency: 'usd', // Default
        metadata: stripeProduct.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe createProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update a product in Stripe
   */
  async updateProduct(productId: string, params: UpdateProductParams): Promise<PaymentProduct> {
    try {
      const stripeProduct = await this.stripe.products.update(productId, {
        name: params.name,
        description: params.description,
        images: params.images,
        active: params.active,
        metadata: params.metadata,
      })

      return {
        id: stripeProduct.id,
        name: stripeProduct.name,
        description: stripeProduct.description || '',
        amount: 0,
        currency: 'usd',
        metadata: stripeProduct.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe updateProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get a product from Stripe
   */
  async getProduct(productId: string): Promise<PaymentProduct> {
    try {
      const stripeProduct = await this.stripe.products.retrieve(productId)

      return {
        id: stripeProduct.id,
        name: stripeProduct.name,
        description: stripeProduct.description || '',
        amount: 0,
        currency: 'usd',
        metadata: stripeProduct.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe getProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Archive (deactivate) a product in Stripe
   */
  async archiveProduct(productId: string): Promise<void> {
    try {
      await this.stripe.products.update(productId, { active: false })
    } catch (error) {
      throw new Error(`Stripe archiveProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Restore (reactivate) a product in Stripe
   */
  async restoreProduct(productId: string): Promise<void> {
    try {
      await this.stripe.products.update(productId, { active: true })
    } catch (error) {
      throw new Error(`Stripe restoreProduct failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a price in Stripe
   */
  async createPrice(params: CreatePriceParams): Promise<PaymentPrice> {
    try {
      const priceData: Stripe.PriceCreateParams = {
        product: params.productId,
        unit_amount: params.amount,
        currency: this.mapCurrency(params.currency),
        metadata: params.metadata || {},
      }

      // Add recurring data for subscriptions
      if (params.type === 'subscription' && params.interval) {
        priceData.recurring = {
          interval: params.interval,
          interval_count: params.intervalCount || 1,
        }
      }

      const stripePrice = await this.stripe.prices.create(priceData)

      return {
        id: stripePrice.id,
        productId: stripePrice.product as string,
        amount: stripePrice.unit_amount || 0,
        currency: params.currency,
        type: params.type,
        interval: params.interval,
        metadata: stripePrice.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe createPrice failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update a price in Stripe
   */
  async updatePrice(priceId: string, params: UpdatePriceParams): Promise<PaymentPrice> {
    try {
      const stripePrice = await this.stripe.prices.update(priceId, {
        active: params.active,
        metadata: params.metadata,
      })

      return {
        id: stripePrice.id,
        productId: stripePrice.product as string,
        amount: stripePrice.unit_amount || 0,
        currency: 'usd', // Stripe returns currency in lowercase
        type: stripePrice.recurring ? 'subscription' : 'one_time',
        interval: stripePrice.recurring?.interval as 'month' | 'year' | undefined,
        metadata: stripePrice.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe updatePrice failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get a price from Stripe
   */
  async getPrice(priceId: string): Promise<PaymentPrice> {
    try {
      const stripePrice = await this.stripe.prices.retrieve(priceId)

      return {
        id: stripePrice.id,
        productId: stripePrice.product as string,
        amount: stripePrice.unit_amount || 0,
        currency: 'usd',
        type: stripePrice.recurring ? 'subscription' : 'one_time',
        interval: stripePrice.recurring?.interval as 'month' | 'year' | undefined,
        metadata: stripePrice.metadata,
      }
    } catch (error) {
      throw new Error(`Stripe getPrice failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Archive (deactivate) a price in Stripe
   */
  async archivePrice(priceId: string): Promise<void> {
    try {
      await this.stripe.prices.update(priceId, { active: false })
    } catch (error) {
      throw new Error(`Stripe archivePrice failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a recurring subscription in Stripe.
   * The price must already be a recurring price (created via createPrice with
   * type: 'subscription').
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<ProviderSubscription> {
    try {
      const stripeSub = await this.stripe.subscriptions.create({
        customer: params.providerCustomerId,
        items: [{ price: params.providerPriceId }],
        metadata: params.metadata || {},
      })

      return this.mapSubscription(stripeSub)
    } catch (error) {
      throw new Error(`Stripe createSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Cancel a Stripe subscription — immediately or at the end of the period.
   */
  async cancelSubscription(providerSubId: string, immediate: boolean): Promise<void> {
    try {
      if (immediate) {
        await this.stripe.subscriptions.cancel(providerSubId)
      } else {
        await this.stripe.subscriptions.update(providerSubId, {
          cancel_at_period_end: true,
        })
      }
    } catch (error) {
      throw new Error(`Stripe cancelSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Reverse a scheduled cancel-at-period-end — the subscription keeps renewing.
   * No-op-safe if it was never scheduled to cancel.
   */
  async reactivateSubscription(providerSubId: string): Promise<void> {
    try {
      await this.stripe.subscriptions.update(providerSubId, {
        cancel_at_period_end: false,
      })
    } catch (error) {
      throw new Error(`Stripe reactivateSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Retrieve a Stripe subscription's current state.
   */
  async getSubscription(providerSubId: string): Promise<ProviderSubscription> {
    try {
      const stripeSub = await this.stripe.subscriptions.retrieve(providerSubId)
      return this.mapSubscription(stripeSub)
    } catch (error) {
      throw new Error(`Stripe getSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Move a subscription to a different recurring price in place, with proration.
   *
   * Swaps the single billable item on the SAME subscription — the subscription
   * id is unchanged — so a plan change never produces a second live Stripe
   * subscription (no double-billing). Stripe settles the mid-period difference
   * per `proration_behavior` (default `create_prorations`) against the saved
   * default payment method. Mirrors the platform-billing proration at
   * lib/payments/platform-plan-change.ts:155.
   */
  async updateSubscription(
    providerSubId: string,
    params: UpdateSubscriptionParams,
  ): Promise<ProviderSubscription> {
    try {
      const current = await this.stripe.subscriptions.retrieve(providerSubId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemId = (current as any).items?.data?.[0]?.id as string | undefined
      if (!itemId) {
        throw new Error(`subscription ${providerSubId} has no billable item to swap`)
      }
      const updated = await this.stripe.subscriptions.update(providerSubId, {
        items: [{ id: itemId, price: params.newProviderPriceId }],
        proration_behavior: params.prorationBehavior ?? 'create_prorations',
        ...(params.metadata ? { metadata: params.metadata } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      return this.mapSubscription(updated)
    } catch (error) {
      throw new Error(`Stripe updateSubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Start a payment. The missing "creation" path that stores a real
   * provider_subscription_id (issue #280, Phase 2).
   *
   * - mode 'subscription' → creates a Stripe Subscription on the recurring
   *   price with `payment_behavior: 'default_incomplete'`, so the first
   *   invoice's PaymentIntent is confirmed client-side. Connect destination
   *   charges + `application_fee_percent` keep the existing revenue split.
   *   `providerRef` is the Subscription id — store it at creation so renewal /
   *   cancel webhooks can match the row.
   * - mode 'one_time' → a PaymentIntent (kept for parity / future product use).
   *
   * Both return `kind: 'client_secret'`; the existing Stripe Elements
   * confirmation on the client works unchanged for either.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
    try {
      if (params.mode === 'subscription') {
        if (!params.providerCustomerId) {
          throw new Error('providerCustomerId is required for a Stripe subscription')
        }
        const subParams: Record<string, unknown> = {
          customer: params.providerCustomerId,
          items: [{ price: params.providerPriceId }],
          payment_behavior: 'default_incomplete',
          payment_settings: { save_default_payment_method: 'on_subscription' },
          // API 2026-02-25.clover: the first-invoice client secret is exposed via
          // confirmation_secret (Invoice.payment_intent was removed).
          expand: ['latest_invoice.confirmation_secret'],
          metadata: { reference: params.reference, ...(params.metadata || {}) },
        }
        if (params.applicationFeePercent && params.applicationFeePercent > 0) {
          subParams.application_fee_percent = params.applicationFeePercent
        }
        if (params.destinationAccount) {
          subParams.transfer_data = { destination: params.destinationAccount }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub = await this.stripe.subscriptions.create(subParams as any)
        // latest_invoice is expanded; cast across API-version type differences.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = (sub as any).latest_invoice as any
        const clientSecret =
          invoice?.confirmation_secret?.client_secret ??
          invoice?.payment_intent?.client_secret ?? // fallback for older API versions
          undefined

        return {
          kind: 'client_secret',
          clientSecret,
          reference: params.reference,
          providerRef: sub.id,
        }
      }

      // one_time
      const piParams: Record<string, unknown> = {
        amount: params.amount,
        currency: params.currency,
        automatic_payment_methods: { enabled: true },
        metadata: { reference: params.reference, ...(params.metadata || {}) },
      }
      if (params.providerCustomerId) piParams.customer = params.providerCustomerId
      if (params.destinationAccount) {
        piParams.transfer_data = { destination: params.destinationAccount }
      }
      if (params.applicationFeePercent && params.applicationFeePercent > 0) {
        piParams.application_fee_amount = Math.round((params.amount * params.applicationFeePercent) / 100)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pi = await this.stripe.paymentIntents.create(piParams as any)
      return {
        kind: 'client_secret',
        clientSecret: pi.client_secret ?? undefined,
        reference: params.reference,
        providerRef: pi.id,
      }
    } catch (error) {
      throw new Error(`Stripe createCheckoutSession failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Verify a Stripe webhook signature against STRIPE_WEBHOOK_SECRET (the Connect
   * student-payments endpoint secret). Used by the unified webhook route.
   */
  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<boolean> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) return false
    const signature = headers['stripe-signature'] ?? headers['Stripe-Signature']
    if (!signature) return false
    try {
      this.stripe.webhooks.constructEvent(rawBody, signature, secret)
      return true
    } catch {
      return false
    }
  }

  /**
   * Collapse a Stripe event into our internal billing vocabulary. Called AFTER
   * verifyWebhook, so a plain JSON parse of the (already trusted) body is safe.
   * Returns null for event types the unified layer does not model.
   */
  async normalizeWebhookEvent(rawBody: string): Promise<NormalizedBillingEvent | null> {
    let event: Stripe.Event
    try {
      event = JSON.parse(rawBody) as Stripe.Event
    } catch {
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = (event.data?.object ?? {}) as any
    const eventId = event.id
    const toDate = (unix?: number) => (unix ? new Date(unix * 1000) : undefined)
    // API 2026-02-25.clover: current_period_end moved off the Subscription onto
    // its items; the Invoice's subscription moved under parent.subscription_details.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subPeriodEnd = (s: any) => toDate(s?.items?.data?.[0]?.current_period_end)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoiceSubId = (inv: any): string | undefined => {
      const sub = inv?.parent?.subscription_details?.subscription ?? inv?.subscription
      return (typeof sub === 'string' ? sub : sub?.id) ?? undefined
    }

    switch (event.type) {
      case 'customer.subscription.deleted':
        return {
          type: 'subscription.expired',
          providerEventId: eventId,
          providerSubscriptionId: obj.id,
          periodEnd: subPeriodEnd(obj),
          raw: event,
        }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        if (obj.status === 'active' || obj.status === 'trialing') {
          return {
            type: 'subscription.activated',
            providerEventId: eventId,
            providerSubscriptionId: obj.id,
            periodEnd: subPeriodEnd(obj),
            raw: event,
          }
        }
        if (obj.status === 'past_due') {
          return { type: 'subscription.past_due', providerEventId: eventId, providerSubscriptionId: obj.id, raw: event }
        }
        if (obj.status === 'canceled') {
          return { type: 'subscription.canceled', providerEventId: eventId, providerSubscriptionId: obj.id, raw: event }
        }
        return null
      }
      case 'invoice.payment_succeeded':
        return {
          type: 'subscription.renewed',
          providerEventId: eventId,
          providerSubscriptionId: invoiceSubId(obj),
          periodEnd: toDate(obj.lines?.data?.[0]?.period?.end ?? obj.period_end),
          raw: event,
        }
      case 'invoice.payment_failed':
        return {
          type: 'subscription.past_due',
          providerEventId: eventId,
          providerSubscriptionId: invoiceSubId(obj),
          raw: event,
        }
      case 'charge.refunded':
        return {
          type: 'refund.succeeded',
          providerEventId: eventId,
          providerPaymentId: obj.payment_intent ?? undefined,
          raw: event,
        }
      case 'payment_intent.succeeded':
        return {
          type: 'payment.succeeded',
          providerEventId: eventId,
          providerPaymentId: obj.id,
          reference: obj.metadata?.transactionId,
          raw: event,
        }
      case 'payment_intent.payment_failed':
        return {
          type: 'payment.failed',
          providerEventId: eventId,
          providerPaymentId: obj.id,
          reference: obj.metadata?.transactionId,
          raw: event,
        }
      default:
        return null
    }
  }

  /**
   * Map a Stripe subscription to our provider-agnostic shape.
   * Stripe API v2025 types moved current_period_end onto items — cast to read it.
   */
  private mapSubscription(stripeSub: Stripe.Subscription): ProviderSubscription {
    const status: ProviderSubscription['status'] =
      stripeSub.status === 'active' || stripeSub.status === 'trialing'
        ? 'active'
        : stripeSub.status === 'past_due'
          ? 'past_due'
          : 'canceled'

    // API 2026-02-25.clover: current_period_end lives on the subscription item.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periodEndUnix = (stripeSub as any).items?.data?.[0]?.current_period_end ?? 0
    return {
      id: stripeSub.id,
      status,
      currentPeriodEnd: new Date(periodEndUnix * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    }
  }

  /**
   * Map our currency types to Stripe currency codes
   */
  private mapCurrency(currency: Currency): string {
    const currencyMap: Record<Currency, string> = {
      usd: 'usd',
      eur: 'eur',
      btc: 'btc', // Stripe doesn't support crypto directly
      eth: 'eth',
      usdt: 'usd', // Fallback to USD for stablecoins
    }
    return currencyMap[currency] || 'usd'
  }
}
