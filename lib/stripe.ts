import Stripe from 'stripe'

// Server-side Stripe instance
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia',
})

// Webhook secret for verifying Stripe events
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
