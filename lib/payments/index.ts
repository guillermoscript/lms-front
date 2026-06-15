/**
 * Payment Provider Factory
 * Creates the appropriate payment provider based on configuration
 */

import { IPaymentProvider, PaymentProvider } from './types'
import { StripePaymentProvider } from './stripe-provider'
import { PayPalPaymentProvider } from './paypal-provider'
import { ManualPaymentProvider } from './manual-provider'
import { LemonSqueezyProvider } from './lemonsqueezy-provider'
import { SolanaProvider } from './solana-provider'
import { SolanaSubscriptionsProvider } from './solana-subscriptions-provider'

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

    case 'lemonsqueezy': {
      const lsKey = process.env.LEMONSQUEEZY_API_KEY
      const lsStore = process.env.LEMONSQUEEZY_STORE_ID
      const lsSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
      if (!lsKey || !lsStore || !lsSecret) {
        throw new Error(
          'LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_WEBHOOK_SECRET are required',
        )
      }
      return new LemonSqueezyProvider(lsKey, lsStore, lsSecret)
    }

    case 'solana': {
      const rpcUrl = process.env.SOLANA_RPC_URL
      if (!rpcUrl) {
        throw new Error('SOLANA_RPC_URL is required')
      }
      // Receiving wallets are per-tenant (tenant_payment_wallets) + the platform
      // fee wallet (SOLANA_PLATFORM_WALLET, read in the /tx + /verify routes).
      // SOLANA_USDC_MINT optional — omit for native SOL payments.
      return new SolanaProvider(rpcUrl, process.env.SOLANA_USDC_MINT)
    }

    case 'solana_subs':
      // Native on-chain auto-pull subscriptions. No required config here:
      // RPC / puller keypair / wallets are read in the subscribe-tx + verify +
      // crank-cron routes.
      return new SolanaSubscriptionsProvider()

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
export { LemonSqueezyProvider } from './lemonsqueezy-provider'
export { SolanaProvider } from './solana-provider'
export { SolanaSubscriptionsProvider } from './solana-subscriptions-provider'
