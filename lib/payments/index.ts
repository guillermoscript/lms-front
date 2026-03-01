/**
 * Payment Provider Factory
 * Creates the appropriate payment provider based on configuration
 */

import { IPaymentProvider, PaymentProvider } from './types'
import { StripePaymentProvider } from './stripe-provider'
import { PayPalPaymentProvider } from './paypal-provider'
import { ManualPaymentProvider } from './manual-provider'

/**
 * Get payment provider instance based on provider type
 */
export function getPaymentProvider(
  provider: PaymentProvider = 'stripe'
): IPaymentProvider {
  switch (provider) {
    case 'stripe':
      const stripeKey = process.env.STRIPE_SECRET_KEY
      if (!stripeKey) {
        throw new Error('STRIPE_SECRET_KEY is required')
      }
      return new StripePaymentProvider(stripeKey)

    case 'paypal':
      const paypalClientId = process.env.PAYPAL_CLIENT_ID
      const paypalSecret = process.env.PAYPAL_CLIENT_SECRET
      if (!paypalClientId || !paypalSecret) {
        throw new Error('PayPal credentials are required')
      }
      return new PayPalPaymentProvider(paypalClientId, paypalSecret)

    case 'binance':
      // TODO: Implement Binance Pay provider
      throw new Error('Binance provider not yet implemented')

    case 'manual':
      return new ManualPaymentProvider()

    default:
      throw new Error(`Unknown payment provider: ${provider}`)
  }
}

/**
 * Get default payment provider from environment
 */
export function getDefaultPaymentProvider(): IPaymentProvider {
  const provider = (process.env.PAYMENT_PROVIDER as PaymentProvider) || 'stripe'
  return getPaymentProvider(provider)
}

// Export types and providers
export * from './types'
export { StripePaymentProvider } from './stripe-provider'
export { PayPalPaymentProvider } from './paypal-provider'
export { ManualPaymentProvider } from './manual-provider'
