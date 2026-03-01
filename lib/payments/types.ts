/**
 * Payment Provider Types
 * Defines interfaces for multiple payment providers (Stripe, PayPal, Binance, etc.)
 */

export type PaymentProvider = 'stripe' | 'paypal' | 'binance' | 'manual'

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

  // Utility
  convertAmount(amount: number, fromUnit: 'base' | 'major'): number
}

/**
 * Result type for operations
 */
export type PaymentResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string }
