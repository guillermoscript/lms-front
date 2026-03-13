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
  Currency,
} from './types'

export class StripePaymentProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'stripe'
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
