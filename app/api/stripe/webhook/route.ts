import { NextRequest, NextResponse } from 'next/server'
import { getStripe, getWebhookSecret } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Lazy initialize Supabase admin client
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase environment variables not set')
  }
  return createClient(url, serviceKey)
}

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(payload, signature, getWebhookSecret())
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const { transactionId } = paymentIntent.metadata

      if (transactionId) {
        // Update transaction to successful
        // This triggers the database function `trigger_manage_transactions`
        // which automatically calls `enroll_user` or `handle_new_subscription`
        const { error } = await getSupabaseAdmin()
          .from('transactions')
          .update({ status: 'successful' })
          .eq('transaction_id', parseInt(transactionId))

        if (error) {
          console.error('Failed to update transaction:', error)
          return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
        }

        console.log(`Transaction ${transactionId} marked as successful`)
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const { transactionId } = paymentIntent.metadata

      if (transactionId) {
        await getSupabaseAdmin()
          .from('transactions')
          .update({ status: 'failed' })
          .eq('transaction_id', parseInt(transactionId))

        console.log(`Transaction ${transactionId} marked as failed`)
      }
      break
    }

    default:
      // Unhandled event type
      console.log(`Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}

// Disable body parsing for webhook route (Stripe needs raw body)
export const runtime = 'nodejs'
