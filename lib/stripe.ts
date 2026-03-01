import Stripe from 'stripe'

// Server-side Stripe instance (lazy initialization to handle build time)
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
    }
    _stripe = new Stripe(secretKey, {
      apiVersion: '2025-12-15.clover',
    })
  }
  return _stripe
}

// Webhook secret for verifying Stripe events
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set in environment variables')
  }
  return secret
}
