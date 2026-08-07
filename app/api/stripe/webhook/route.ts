import { NextRequest, NextResponse } from 'next/server'
import { getStripe, getWebhookSecret } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { sendEmail } from '@/lib/email/send'
import { enrollmentConfirmedTemplate } from '@/lib/email/templates/enrollment-confirmed'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'
import { netOfRefunds } from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'

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
 * Extract the subscription id + metadata from an Invoice across Stripe API
 * versions. On 2026-02-25.clover the subscription moved under
 * `invoice.parent.subscription_details`; older versions used `invoice.subscription`.
 */
function getInvoiceSubscription(invoice: Stripe.Invoice): {
  id: string | null
  metadata: Record<string, string>
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = invoice as any
  const details = inv.parent?.subscription_details
  const sub = details?.subscription ?? inv.subscription
  const id = (typeof sub === 'string' ? sub : sub?.id) ?? null
  return { id, metadata: details?.metadata ?? {} }
}

/**
 * The platform's cut of a sale, for analytics only.
 *
 * Two inputs, both mandated by #547 and neither interchangeable with the other:
 * WHETHER a fee is taken is the provider's `bearsPlatformFee` capability (never
 * `revenue_splits.applies_to_providers`, retired in #547 because it stored the
 * labels `stripe`/`manual` rather than provider slugs), and the RATE is the
 * transaction's OWN `school_percentage_snapshot` — the same number
 * `getPayoutsOwed` will use — so the chart and the payout reconcile row by row.
 *
 * Returns a spreadable fragment that OMITS `platform_fee` entirely — never a
 * guess — when the row carries no snapshot: a fabricated default is how the
 * school-facing and platform-facing figures drift apart. The companion
 * `school_percentage_snapshot: null` on the event says why it is missing.
 */
function platformFeeFor(
  provider: string,
  netAmount: number,
  schoolPercentageSnapshot: number | null | undefined,
): { platform_fee: number } | Record<string, never> {
  if (!PROVIDER_CAPABILITIES[provider as PaymentProvider]?.bearsPlatformFee) {
    return { platform_fee: 0 }
  }
  if (schoolPercentageSnapshot == null) return {}
  return { platform_fee: Math.round(netAmount * (100 - Number(schoolPercentageSnapshot))) / 100 }
}

/**
 * How many entitlement rows the flip actually produced. The
 * `after_transaction_update` trigger runs in the same statement, so by the time
 * the UPDATE has returned they exist — a zero here is a real "paid but got
 * nothing" incident, which is the whole reason the event carries a count.
 */
async function countGrantedEntitlements(
  userId: string,
  sourceType: 'product' | 'subscription',
  sourceId: number,
): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from('entitlements')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .eq('status', 'active')
  return count ?? 0
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
        // The analytics columns ride on the idempotency read that was already
        // happening — no extra round trip on the payment path. NOTE:
        // `transaction_date`, never `created_at`; that column does not exist and
        // selecting it 42703s the whole request.
        const { data: txBefore } = await getSupabaseAdmin()
          .from('transactions')
          .select(
            'status, user_id, tenant_id, amount, refunded_amount, currency, product_id, plan_id, school_percentage_snapshot, transaction_date',
          )
          .eq('transaction_id', parseInt(transactionId))
          .single()

        if (txBefore?.status !== 'pending') {
          console.log(`Transaction ${transactionId} already processed (status: ${txBefore?.status}) — skipping`)
          break
        }

        const { data: flipped, error } = await getSupabaseAdmin()
          .from('transactions')
          .update({ status: 'successful' })
          .eq('transaction_id', parseInt(transactionId))
          .eq('status', 'pending')
          .select('transaction_id')
          .maybeSingle()

        if (error) {
          console.error('Failed to update transaction:', error)
          return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
        }

        if (!flipped) {
          // Concurrent delivery already flipped this transaction — do not re-send
          // the enrollment email or re-run side effects. The first delivery owns them.
          console.log(`Transaction ${transactionId} already flipped by a concurrent delivery — skipping side effects`)
          break
        }

        // Loop C. Inside the `flipped` guard on purpose: a concurrent delivery
        // that lost the race already returned above, so exactly one settlement
        // event is emitted per sale however many times Stripe delivers it.
        //
        // NET of refunds (#547): a partial refund keeps the row 'successful',
        // so summing gross `amount` would recreate the overstatement that issue
        // fixed. On a fresh flip `refunded_amount` is 0 and this is a no-op —
        // it is here so the property is net *by construction*, not by luck.
        {
          const gross = Number(txBefore?.amount ?? 0)
          const net = netOfRefunds(gross, txBefore?.refunded_amount as number | null)
          const snapshot = txBefore?.school_percentage_snapshot as number | null
          await track(
            ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
            {
              provider: 'stripe',
              amount_major: net,
              currency: (txBefore?.currency as string | null) ?? 'usd',
              is_subscription: !!txBefore?.plan_id,
              ...platformFeeFor('stripe', net, snapshot),
              school_percentage_snapshot: snapshot,
              gross_amount: gross,
              transaction_id: parseInt(transactionId),
              ...(txBefore?.product_id ? { product_id: txBefore.product_id } : {}),
              ...(txBefore?.plan_id ? { plan_id: txBefore.plan_id } : {}),
            },
            { userId: txBefore?.user_id, tenantId: tenantId ?? (txBefore?.tenant_id as string | null) },
          )

          // The DB trigger created the entitlements inside the same statement,
          // so this reads the real outcome. A zero is a paid-but-no-access
          // incident, which is precisely what the count exists to surface.
          const sourceType = txBefore?.plan_id ? 'subscription' : 'product'
          const sourceId = (txBefore?.plan_id ?? txBefore?.product_id) as number | null
          if (txBefore?.user_id && sourceId != null) {
            await track(
              ANALYTICS_EVENTS.ENTITLEMENT_GRANTED,
              {
                source_type: sourceType,
                course_count: await countGrantedEntitlements(txBefore.user_id, sourceType, sourceId),
                provider: 'stripe',
                transaction_id: parseInt(transactionId),
              },
              { userId: txBefore.user_id, tenantId: tenantId ?? (txBefore?.tenant_id as string | null) },
            )
          }
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

        // Status-guarded so a redelivery cannot emit a second failure, and the
        // returned row supplies the buyer/tenant the event is attributed to
        // without a separate read.
        const { data: failed } = await getSupabaseAdmin()
          .from('transactions')
          .update({ status: 'failed' })
          .eq('transaction_id', parseInt(transactionId))
          .neq('status', 'failed')
          .select('user_id, tenant_id, amount, currency, plan_id, product_id')
          .maybeSingle()

        if (failed) {
          await track(
            ANALYTICS_EVENTS.PAYMENT_FAILED,
            {
              provider: 'stripe',
              failure_reason:
                paymentIntent.last_payment_error?.code ||
                paymentIntent.last_payment_error?.message ||
                'unknown',
              decline_code: paymentIntent.last_payment_error?.decline_code ?? null,
              amount: Number(failed.amount ?? 0),
              currency: (failed.currency as string | null) ?? 'usd',
              is_subscription: !!failed.plan_id,
              transaction_id: parseInt(transactionId),
            },
            { userId: failed.user_id, tenantId: tenantId ?? (failed.tenant_id as string | null) },
          )
        }

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
          .select('transaction_id, tenant_id, product_id, plan_id, user_id, status, amount, currency, refunded_amount')
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
            .update({
              status: newStatus,
              // Persist the slice as well (#547). Stripe Connect sits outside
              // the manual-payout math, but the school-facing revenue screens
              // read this column for every provider — without it a partially
              // refunded Stripe sale still counted in full toward the school's
              // revenue. `amount_refunded` is cumulative and in minor units.
              refunded_amount: charge.amount_refunded / 100,
            })
            .eq('transaction_id', transaction.transaction_id)
            .eq('status', 'successful')

          // Loop C. Emitted only when the cumulative refunded total actually
          // MOVED. `charge.amount_refunded` is cumulative and a partial refund
          // leaves the row 'successful', so the idempotency guard above lets a
          // redelivery back in — without this comparison the same $10 slice
          // would be counted twice.
          const priorRefunded = Number(transaction.refunded_amount ?? 0)
          const cumulativeRefunded = charge.amount_refunded / 100
          if (cumulativeRefunded > priorRefunded + 0.005) {
            const gross = Number(transaction.amount ?? 0)
            await track(
              ANALYTICS_EVENTS.REFUND_ISSUED,
              {
                is_partial: !isFullRefund,
                // This event's own slice, not the running total.
                refunded_amount: cumulativeRefunded - priorRefunded,
                cumulative_refunded_amount: cumulativeRefunded,
                // What the sale is still worth after the refund (#547).
                net_amount: netOfRefunds(gross, cumulativeRefunded),
                gross_amount: gross,
                currency: (transaction.currency as string | null) ?? 'usd',
                provider: 'stripe',
                is_subscription: !!transaction.plan_id,
                transaction_id: transaction.transaction_id,
              },
              { userId: transaction.user_id, tenantId: transaction.tenant_id },
            )
          }

          if (!isFullRefund) {
            console.log(`Partial refund of ${charge.amount_refunded / 100} for transaction ${transaction.transaction_id}`)
            break
          }

          // Revoke access if product purchase — revoke the product entitlements
          if (transaction.product_id) {
            await getSupabaseAdmin()
              .from('entitlements')
              .update({ status: 'revoked', revoked_at: new Date().toISOString() })
              .eq('user_id', transaction.user_id)
              .eq('source_type', 'product')
              .eq('source_id', transaction.product_id)

            console.log(`Revoked access for user ${transaction.user_id} product ${transaction.product_id}`)
          }

          // Cancel subscription if plan purchase.
          // The DB trigger `on_subscription_status_change` automatically revokes
          // linked entitlements when status → 'canceled'.
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
    // The DB trigger `on_subscription_status_change` revokes linked entitlements automatically.
    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription
      const stripeSubId = stripeSub.id

      // Shared dispatcher: matches by (provider_subscription_id, 'stripe') and
      // sets status → expired (DB trigger disables linked enrollments).
      await dispatchBillingEvent(
        {
          type: 'subscription.expired',
          providerEventId: event.id,
          providerSubscriptionId: stripeSubId,
          raw: event,
        },
        { provider: 'stripe', admin: getSupabaseAdmin() }
      )

      // Fallback for legacy rows created before provider_subscription_id was
      // stored: match by tenant + metadata. The status='active' filter means
      // this is a no-op when the dispatcher already matched the row above.
      const tenantMeta = stripeSub.metadata?.tenant_id || tenantId
      const userId = stripeSub.metadata?.user_id
      if (tenantMeta && userId) {
        await getSupabaseAdmin()
          .from('subscriptions')
          .update({
            subscription_status: 'expired',
            ended_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('tenant_id', tenantMeta)
          .eq('subscription_status', 'active')
      }

      console.log(`Processed subscription.deleted (Stripe sub ${stripeSubId})`)
      break
    }

    // Fired when a recurring payment fails (before subscription is deleted).
    // The subscription_status enum has no 'past_due' value, so the shared
    // dispatcher logs this rather than writing it — access continues during
    // Stripe's retry window until a customer.subscription.deleted arrives.
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const { id: stripeSubId } = getInvoiceSubscription(invoice)

      await dispatchBillingEvent(
        {
          type: 'subscription.past_due',
          providerEventId: event.id,
          providerSubscriptionId: stripeSubId ?? undefined,
          raw: event,
        },
        { provider: 'stripe', admin: getSupabaseAdmin() }
      )
      break
    }

    // Native subscriptions (#280 Phase 2). The first invoice's PaymentIntent is
    // created by Stripe and carries NO transactionId metadata, so it cannot be
    // activated via payment_intent.succeeded — this invoice event is the signal.
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const billingReason = (invoice as any).billing_reason as string | undefined
      const { id: stripeSubId, metadata: subMeta } = getInvoiceSubscription(invoice)

      if (!stripeSubId) break

      if (billingReason === 'subscription_create') {
        // First payment. Match the pending transaction by the transactionId we
        // put in the subscription metadata at checkout (robust to the route's
        // RLS provider_subscription_id write racing this webhook), falling back
        // to the stored provider_subscription_id. Then flip → successful AND set
        // provider_subscription_id authoritatively (admin client) in one update,
        // so handle_new_subscription always reads the real sub id. Status-guarded
        // for idempotency.
        const txnIdMeta = subMeta.transactionId ? parseInt(subMeta.transactionId, 10) : null

        let lookup = getSupabaseAdmin()
          .from('transactions')
          .select(
            'transaction_id, user_id, tenant_id, amount, refunded_amount, currency, plan_id, school_percentage_snapshot',
          )
          .eq('status', 'pending')
        lookup = txnIdMeta
          ? lookup.eq('transaction_id', txnIdMeta)
          : lookup.eq('provider_subscription_id', stripeSubId).eq('payment_provider', 'stripe')
        const { data: tx } = await lookup.maybeSingle()

        if (tx) {
          const { data: activated } = await getSupabaseAdmin()
            .from('transactions')
            .update({
              status: 'successful',
              provider_subscription_id: stripeSubId,
              payment_provider: 'stripe',
            })
            .eq('transaction_id', tx.transaction_id)
            .eq('status', 'pending')
            .select('transaction_id')
            .maybeSingle()
          console.log(`Activated subscription transaction ${tx.transaction_id} (Stripe sub ${stripeSubId})`)

          // Loop C, native-subscription first charge. Gated on the flip having
          // landed so a redelivery — or the payment_intent.succeeded path racing
          // this one — cannot bill the funnel twice.
          if (activated) {
            const gross = Number(tx.amount ?? 0)
            const net = netOfRefunds(gross, tx.refunded_amount as number | null)
            const snapshot = tx.school_percentage_snapshot as number | null
            await track(
              ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
              {
                provider: 'stripe',
                amount_major: net,
                currency: (tx.currency as string | null) ?? 'usd',
                is_subscription: true,
                is_renewal: false,
                ...platformFeeFor('stripe', net, snapshot),
                school_percentage_snapshot: snapshot,
                gross_amount: gross,
                transaction_id: tx.transaction_id,
                ...(tx.plan_id ? { plan_id: tx.plan_id } : {}),
              },
              { userId: tx.user_id, tenantId: tx.tenant_id as string | null },
            )

            if (tx.user_id && tx.plan_id != null) {
              await track(
                ANALYTICS_EVENTS.ENTITLEMENT_GRANTED,
                {
                  source_type: 'subscription',
                  course_count: await countGrantedEntitlements(tx.user_id, 'subscription', tx.plan_id),
                  provider: 'stripe',
                  transaction_id: tx.transaction_id,
                },
                { userId: tx.user_id, tenantId: tx.tenant_id as string | null },
              )
            }
          }
        } else {
          console.warn(`No pending transaction for subscription_create (Stripe sub ${stripeSubId}, txn meta ${subMeta.transactionId ?? 'none'})`)
        }
      } else if (billingReason === 'subscription_cycle') {
        // Renewal: extend the access window (end_date + entitlements) via the
        // shared dispatcher → extend_subscription_period RPC. Idempotent: the
        // period end comes from the invoice, not now().
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = invoice as any
        const periodEndUnix = inv.lines?.data?.[0]?.period?.end ?? inv.period_end

        // Read the subscription BEFORE the dispatcher extends it. This is the
        // one deliberate extra query on this route, and it buys two things a
        // renewal event cannot do without: the buyer + tenant to attribute the
        // money to (a renewal creates no transaction row, so there is nothing
        // else holding them), and an idempotency reference — this endpoint has
        // no `webhook_events` ledger, so a redelivered renewal would otherwise
        // be counted as a second month of revenue.
        const { data: renewedSub } = await getSupabaseAdmin()
          .from('subscriptions')
          .select('user_id, tenant_id, plan_id, current_period_end')
          .eq('provider_subscription_id', stripeSubId)
          .eq('payment_provider', 'stripe')
          .maybeSingle()

        await dispatchBillingEvent(
          {
            type: 'subscription.renewed',
            providerEventId: event.id,
            providerSubscriptionId: stripeSubId,
            periodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : undefined,
            raw: event,
          },
          { provider: 'stripe', admin: getSupabaseAdmin() }
        )
        // Only when the invoice genuinely moves the period forward. Equal or
        // earlier means a redelivery (or an out-of-order event the dispatcher
        // itself ignores), and neither is a new month of revenue.
        const movedForward =
          !!periodEndUnix &&
          (!renewedSub?.current_period_end ||
            periodEndUnix * 1000 > new Date(renewedSub.current_period_end).getTime())

        if (renewedSub && movedForward) {
          // Stripe reports invoice money in MINOR units; the contract is MAJOR.
          const amountMajor = Number(inv.amount_paid ?? 0) / 100
          await track(
            ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
            {
              provider: 'stripe',
              amount_major: amountMajor,
              currency: (inv.currency as string | undefined) ?? 'usd',
              is_subscription: true,
              is_renewal: true,
              // A renewal has no transaction row and therefore no
              // `school_percentage_snapshot` of its own. Reporting `null` is
              // honest; inventing today's split rate would make this event
              // disagree with whatever the payouts computation later does.
              school_percentage_snapshot: null,
              ...(renewedSub.plan_id ? { plan_id: renewedSub.plan_id } : {}),
              period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
            },
            { userId: renewedSub.user_id, tenantId: renewedSub.tenant_id as string | null },
          )
        }

        console.log(`Processed subscription renewal for Stripe sub ${stripeSubId}`)
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
