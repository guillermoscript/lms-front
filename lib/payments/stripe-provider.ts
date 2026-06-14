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
  ProviderSubscription,
  ProviderCapabilities,
  NormalizedBillingEvent,
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

    const obj = (event.data?.object ?? {}) as any
    const eventId = event.id
    const toDate = (unix?: number) => (unix ? new Date(unix * 1000) : undefined)

    switch (event.type) {
      case 'customer.subscription.deleted':
        return {
          type: 'subscription.expired',
          providerEventId: eventId,
          providerSubscriptionId: obj.id,
          periodEnd: toDate(obj.current_period_end),
          raw: event,
        }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        if (obj.status === 'active' || obj.status === 'trialing') {
          return {
            type: 'subscription.activated',
            providerEventId: eventId,
            providerSubscriptionId: obj.id,
            periodEnd: toDate(obj.current_period_end),
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
          providerSubscriptionId: obj.subscription ?? undefined,
          periodEnd: toDate(obj.lines?.data?.[0]?.period?.end),
          raw: event,
        }
      case 'invoice.payment_failed':
        return {
          type: 'subscription.past_due',
          providerEventId: eventId,
          providerSubscriptionId: obj.subscription ?? undefined,
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

    return {
      id: stripeSub.id,
      status,
      currentPeriodEnd: new Date(((stripeSub as any).current_period_end ?? 0) * 1000),
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
