/**
 * Manual/Offline Payment Provider
 * For offline payments, bank transfers, or manual invoice processing
 */

import {
  IPaymentProvider,
  PaymentProvider,
  PaymentProduct,
  PaymentPrice,
  CreateProductParams,
  CreatePriceParams,
  UpdateProductParams,
  UpdatePriceParams,
} from './types'

export class ManualPaymentProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'manual'

  convertAmount(amount: number, fromUnit: 'base' | 'major'): number {
    // Manual payments use major units (no conversion needed)
    return amount
  }

  async createProduct(params: CreateProductParams): Promise<PaymentProduct> {
    // For manual payments, we just generate a local ID
    // No external payment processor involved
    return {
      id: `manual_prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: params.name,
      description: params.description,
      amount: 0,
      currency: 'usd',
      metadata: params.metadata,
    }
  }

  async updateProduct(productId: string, params: UpdateProductParams): Promise<PaymentProduct> {
    // Manual products are just stored in our database
    // No external update needed
    return {
      id: productId,
      name: params.name || '',
      description: params.description || '',
      amount: 0,
      currency: 'usd',
      metadata: params.metadata,
    }
  }

  async getProduct(productId: string): Promise<PaymentProduct> {
    return {
      id: productId,
      name: 'Manual Product',
      description: '',
      amount: 0,
      currency: 'usd',
    }
  }

  async archiveProduct(productId: string): Promise<void> {
    // Manual products are archived only in database
    // Nothing to do here
  }

  async restoreProduct(productId: string): Promise<void> {
    // Manual products are restored only in database
    // Nothing to do here
  }

  async createPrice(params: CreatePriceParams): Promise<PaymentPrice> {
    // Manual prices are stored in database only
    return {
      id: `manual_price_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
      currency: 'usd',
      type: 'one_time',
      metadata: params.metadata,
    }
  }

  async getPrice(priceId: string): Promise<PaymentPrice> {
    return {
      id: priceId,
      productId: '',
      amount: 0,
      currency: 'usd',
      type: 'one_time',
    }
  }

  async archivePrice(priceId: string): Promise<void> {
    // Manual prices archived in database only
  }
}
