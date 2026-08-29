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
      // Must equal the SDK's own pinned ApiVersion exactly — stripe-node types
      // this field as a single string literal, so any other value is a type
      // error. It moves on a MINOR bump (22.5.0 → 22.6.0 shifted it from
      // 2026-07-29 to 2026-08-26), and the production image installs without a
      // lockfile (Dockerfile:18), so `stripe` is pinned exactly in package.json
      // to stop a floating minor from breaking the build. Bump both together.
      apiVersion: '2026-08-26.dahlia',
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
