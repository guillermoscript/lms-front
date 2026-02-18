import { NextRequest, NextResponse } from 'next/server'
import { getStripe, getWebhookSecret } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { sendEmail } from '@/lib/email/send'
import { enrollmentConfirmedTemplate } from '@/lib/email/templates/enrollment-confirmed'

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
        // Idempotency: only update if still pending
        const { data: txBefore } = await getSupabaseAdmin()
          .from('transactions')
          .select('status, user_id')
          .eq('transaction_id', parseInt(transactionId))
          .single()

        if (txBefore?.status !== 'pending') {
          console.log(`Transaction ${transactionId} already processed (status: ${txBefore?.status}) — skipping`)
          break
        }

        const { error } = await getSupabaseAdmin()
          .from('transactions')
          .update({ status: 'successful' })
          .eq('transaction_id', parseInt(transactionId))
          .eq('status', 'pending')

        if (error) {
          console.error('Failed to update transaction:', error)
          return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
        }

        // Send enrollment confirmation email
        if (txBefore?.user_id) {
          try {
            const { data: authUser } = await getSupabaseAdmin().auth.admin.getUserById(txBefore.user_id)
            const { data: txFull } = await getSupabaseAdmin()
              .from('transactions')
              .select('product_id, products(name)')
              .eq('transaction_id', parseInt(transactionId))
              .single()
            const { data: tenantRow } = await getSupabaseAdmin()
              .from('tenants')
              .select('name')
              .eq('id', tenantId || '')
              .single()

            if (authUser?.user?.email) {
              const email = authUser.user.email
              const productName = (txFull?.products as any)?.name || 'your course'
              const schoolName = tenantRow?.name || 'LMS Platform'
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
              const template = enrollmentConfirmedTemplate({
                studentName: authUser.user.user_metadata?.full_name || email,
                courseTitle: productName,
                schoolName,
                dashboardUrl: `${appUrl}/dashboard/student/courses`,
              })
              await sendEmail({ to: email, ...template })
            }
          } catch (emailErr) {
            console.error('Failed to send enrollment email:', emailErr)
          }
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

          // Idempotency: only process if transaction is still successful (not already refunded)
          if ((transaction as any).status !== 'successful') {
            console.log(`Transaction ${transaction.transaction_id} not in successful state — skipping refund`)
            break
          }

          // Handle partial refunds: only fully cancel if fully refunded
          const isFullRefund = charge.amount_refunded >= charge.amount
          const newStatus = isFullRefund ? 'refunded' : 'successful'

          await getSupabaseAdmin()
            .from('transactions')
            .update({ status: newStatus, refunded_amount: charge.amount_refunded / 100 })
            .eq('transaction_id', transaction.transaction_id)
            .eq('status', 'successful')

          if (!isFullRefund) {
            console.log(`Partial refund of ${charge.amount_refunded / 100} for transaction ${transaction.transaction_id}`)
            break
          }

          // Cancel enrollments if product purchase
          if (transaction.product_id) {
            await getSupabaseAdmin()
              .from('enrollments')
              .update({ status: 'disabled' })
              .eq('user_id', transaction.user_id)
              .eq('product_id', transaction.product_id)

            console.log(`Disabled enrollments for user ${transaction.user_id} product ${transaction.product_id}`)
          }

          // Cancel subscription if plan purchase.
          // The DB trigger `trigger_deactivate_enrollments_on_subscription_end`
          // automatically disables linked enrollments when status → 'canceled'.
          if (transaction.plan_id) {
            await getSupabaseAdmin()
              .from('subscriptions')
              .update({ subscription_status: 'canceled' })
              .eq('user_id', transaction.user_id)
              .eq('plan_id', transaction.plan_id)
              .eq('tenant_id', transaction.tenant_id)

            console.log(`Canceled subscription and disabled enrollments for user ${transaction.user_id} plan ${transaction.plan_id}`)
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

    // Fired when Stripe permanently ends a subscription after failed payment retries
    // or explicit cancellation via Stripe dashboard/API.
    // The DB trigger deactivates linked enrollments automatically.
    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription
      const stripeSubId = stripeSub.id

      // Find our subscription row by matching the Stripe subscription ID stored at creation
      const { data: sub } = await getSupabaseAdmin()
        .from('subscriptions')
        .select('subscription_id, user_id, plan_id, tenant_id')
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle()

      if (sub) {
        await getSupabaseAdmin()
          .from('subscriptions')
          .update({
            subscription_status: 'expired',
            ended_at: new Date().toISOString(),
          })
          .eq('subscription_id', sub.subscription_id)

        console.log(`Subscription ${sub.subscription_id} expired (Stripe sub ${stripeSubId})`)
      } else {
        // Fallback: match by tenant + metadata if stripe_subscription_id not stored
        const tenantMeta = stripeSub.metadata?.tenant_id || tenantId
        if (tenantMeta) {
          const userId = stripeSub.metadata?.user_id
          if (userId) {
            await getSupabaseAdmin()
              .from('subscriptions')
              .update({
                subscription_status: 'expired',
                ended_at: new Date().toISOString(),
              })
              .eq('user_id', userId)
              .eq('tenant_id', tenantMeta)
              .eq('subscription_status', 'active')

            console.log(`Expired active subscriptions for user ${userId} tenant ${tenantMeta}`)
          }
        }
      }
      break
    }

    // Fired when a recurring payment fails (before subscription is deleted).
    // Mark subscription as past_due — access continues during Stripe's retry window.
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const stripeSubId = (invoice as any).subscription as string | null

      if (stripeSubId) {
        const { data: sub } = await getSupabaseAdmin()
          .from('subscriptions')
          .select('subscription_id')
          .eq('stripe_subscription_id', stripeSubId)
          .maybeSingle()

        if (sub) {
          await getSupabaseAdmin()
            .from('subscriptions')
            .update({ subscription_status: 'past_due' as any })
            .eq('subscription_id', sub.subscription_id)

          console.log(`Subscription ${sub.subscription_id} marked past_due`)
        }
      }
      break
    }

    case 'account.updated': {
      // Stripe Connect: account onboarding status update
      if (connectedAccountId && tenantId) {
        const account = event.data.object as Stripe.Account
        await getSupabaseAdmin()
          .from('tenants')
          .update({
            stripe_charges_enabled: account.charges_enabled,
            stripe_payouts_enabled: account.payouts_enabled,
            stripe_details_submitted: account.details_submitted,
          })
          .eq('stripe_account_id', connectedAccountId)
        console.log(`Stripe account ${connectedAccountId} updated for tenant ${tenantId}: charges=${account.charges_enabled}`)
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
