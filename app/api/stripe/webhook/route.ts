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

/**
 * Resolve tenant_id from a Stripe Connect account ID.
 * Returns null for direct (non-Connect) events.
 */
async function resolveTenantFromStripeAccount(accountId?: string): Promise<string | null> {
  if (!accountId) return null

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('stripe_account_id', accountId)
    .single()

  return data?.id || null
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

  // For Stripe Connect events, resolve the tenant
  const connectedAccountId = event.account
  const tenantId = await resolveTenantFromStripeAccount(connectedAccountId)

  if (connectedAccountId && !tenantId) {
    console.warn(`Received event from unknown Stripe account: ${connectedAccountId}`)
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const { transactionId } = paymentIntent.metadata

      if (transactionId) {
        // Validate transaction belongs to tenant (if Connect event)
        if (tenantId) {
          const { data: transaction } = await getSupabaseAdmin()
            .from('transactions')
            .select('tenant_id')
            .eq('transaction_id', parseInt(transactionId))
            .single()

          if (!transaction || transaction.tenant_id !== tenantId) {
            console.error(`Transaction ${transactionId} does not belong to tenant ${tenantId}`)
            return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
          }
        }

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

        console.log(`Transaction ${transactionId} marked as successful (tenant: ${tenantId || 'direct'})`)
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const { transactionId } = paymentIntent.metadata

      if (transactionId) {
        // Validate transaction belongs to tenant (if Connect event)
        if (tenantId) {
          const { data: transaction } = await getSupabaseAdmin()
            .from('transactions')
            .select('tenant_id')
            .eq('transaction_id', parseInt(transactionId))
            .single()

          if (!transaction || transaction.tenant_id !== tenantId) {
            console.error(`Transaction ${transactionId} does not belong to tenant ${tenantId}`)
            return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
          }
        }

        await getSupabaseAdmin()
          .from('transactions')
          .update({ status: 'failed' })
          .eq('transaction_id', parseInt(transactionId))

        console.log(`Transaction ${transactionId} marked as failed`)
      }
      break
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const paymentIntentId = charge.payment_intent as string

      if (paymentIntentId) {
        // Find transaction by Stripe payment intent ID
        const { data: transaction } = await getSupabaseAdmin()
          .from('transactions')
          .select('transaction_id, tenant_id, product_id, plan_id, user_id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .single()

        if (transaction) {
          // Validate tenant (if Connect event)
          if (tenantId && transaction.tenant_id !== tenantId) {
            console.error(`Transaction for payment intent ${paymentIntentId} does not belong to tenant ${tenantId}`)
            return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
          }

          // Mark transaction as refunded
          await getSupabaseAdmin()
            .from('transactions')
            .update({ status: 'refunded' })
            .eq('transaction_id', transaction.transaction_id)

          // Cancel enrollments if product purchase
          if (transaction.product_id) {
            await getSupabaseAdmin()
              .from('enrollments')
              .update({ status: 'disabled' })
              .eq('user_id', transaction.user_id)
              .eq('product_id', transaction.product_id)

            console.log(`Disabled enrollments for user ${transaction.user_id} product ${transaction.product_id}`)
          }

          // Cancel subscription if plan purchase
          if (transaction.plan_id) {
            await getSupabaseAdmin()
              .from('subscriptions')
              .update({ subscription_status: 'canceled' })
              .eq('user_id', transaction.user_id)
              .eq('plan_id', transaction.plan_id)

            console.log(`Canceled subscription for user ${transaction.user_id} plan ${transaction.plan_id}`)
          }

          console.log(`Transaction ${transaction.transaction_id} refunded`)
        }
      }
      break
    }

    case 'payout.paid': {
      // Stripe Connect: payout completed
      if (connectedAccountId && tenantId) {
        const payout = event.data.object as Stripe.Payout

        // Update payout record status
        await getSupabaseAdmin()
          .from('payouts')
          .update({
            status: 'paid',
            paid_at: new Date(payout.arrival_date * 1000).toISOString(),
          })
          .eq('stripe_payout_id', payout.id)
          .eq('tenant_id', tenantId)

        console.log(`Payout ${payout.id} marked as paid for tenant ${tenantId}`)
      }
      break
    }

    case 'payout.failed': {
      // Stripe Connect: payout failed
      if (connectedAccountId && tenantId) {
        const payout = event.data.object as Stripe.Payout

        // Update payout record status
        await getSupabaseAdmin()
          .from('payouts')
          .update({ status: 'failed' })
          .eq('stripe_payout_id', payout.id)
          .eq('tenant_id', tenantId)

        console.log(`Payout ${payout.id} marked as failed for tenant ${tenantId}`)
      }
      break
    }

    case 'account.updated': {
      // Stripe Connect: account onboarding status update
      if (connectedAccountId && tenantId) {
        const account = event.data.object as Stripe.Account
        console.log(`Stripe Connect account ${connectedAccountId} updated for tenant ${tenantId}. Charges enabled: ${account.charges_enabled}`)
      }
      break
    }

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}

// Disable body parsing for webhook route (Stripe needs raw body)
export const runtime = 'nodejs'
