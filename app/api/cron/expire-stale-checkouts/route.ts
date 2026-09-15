/**
 * Cron job: reconcile or expire abandoned hosted checkouts (issue #624).
 *
 * A hosted checkout (PayPal, Lemon Squeezy, Binance Pay) inserts a `pending`
 * transaction and redirects the buyer away. If they close the tab, that row
 * lives forever inside transactions_unique_product / transactions_unique_plan
 * (both cover status IN ('pending','successful')) and the buyer is permanently
 * blocked from purchasing the same item again. PayPal expires abandoned orders
 * on its own side with no guaranteed terminal webhook, and Lemon Squeezy emits
 * no one-time failure event for this path — so nothing clears the row without
 * this job.
 *
 * RECONCILE BEFORE EXPIRING. A lapsed TTL means "we stopped hearing about it",
 * not "it failed". Where the provider gives us a queryable checkout identity we
 * ask it what actually happened first, so a completed-but-undelivered payment
 * is settled rather than cancelled. Only an unanswerable or genuinely dead
 * checkout is expired.
 *
 * CAPABILITY-GATED, never provider name: `supportsHostedCheckout` is exactly
 * the property that creates the hazard (we redirect away and may never hear
 * back). Stripe Elements, Solana Pay and manual payments never set
 * `checkout_expires_at` at all, so they cannot appear in this queue.
 *
 * Secured by CRON_SECRET. Scheduled from .github/workflows/cron.yml; operating
 * notes in docs/CRON_RUNBOOK.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { reconcilePayPalCheckout } from '@/lib/payments/paypal-reconcile'
import type Stripe from 'stripe'
import { isExpirableCheckoutProvider } from '@/lib/payments/checkout-expiry'
import { abandonStripeCheckout } from '@/lib/payments/stripe-reconcile'
import { getStripe } from '@/lib/stripe'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'

export const runtime = 'nodejs'

/** Cap one pass so a backlog cannot time the request out; the next tick continues. */
const BATCH_LIMIT = 200

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

interface StaleCheckout {
  transaction_id: number
  user_id: string
  tenant_id: string
  payment_provider: string | null
  provider_checkout_id: string | null
  stripe_payment_intent_id: string | null
  provider_subscription_id: string | null
  amount: number | null
  currency: string | null
  plan_id: number | null
  product_id: number | null
  checkout_expires_at: string | null
  transaction_date: string
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: stale, error } = await admin
    .from('transactions')
    .select(
      'transaction_id, user_id, tenant_id, payment_provider, provider_checkout_id, stripe_payment_intent_id, provider_subscription_id, amount, currency, plan_id, product_id, checkout_expires_at, transaction_date',
    )
    .eq('status', 'pending')
    .not('checkout_expires_at', 'is', null)
    .lt('checkout_expires_at', now)
    .order('checkout_expires_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) {
    console.error('[expire-stale-checkouts] query failed:', error)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const rows = (stale ?? []) as StaleCheckout[]

  // Belt and braces: `checkout_expires_at` is only ever written for hosted
  // rails and Stripe Elements, but re-assert it here rather than trusting that
  // no other writer ever sets the column.
  const candidates = rows.filter(row => isExpirableCheckoutProvider(row.payment_provider))

  const recovered: number[] = []
  const expired: StaleCheckout[] = []
  let expiredCount = 0
  let stripe: Stripe | null = null

  for (const row of candidates) {
    if (row.payment_provider === 'stripe') {
      // A card form nobody came back to (#754). Stripe never tells us, so ask:
      // a still-payable PaymentIntent / incomplete subscription is canceled at
      // Stripe first, so a stale tab cannot pay a row we are about to expire.
      // Only `dead` expires; money in motion or Stripe not answering waits.
      try {
        stripe ??= getStripe()
      } catch {
        recovered.push(row.transaction_id)
        continue
      }
      if ((await abandonStripeCheckout(stripe, row)) !== 'dead') {
        recovered.push(row.transaction_id)
        continue
      }
    }
    if (row.payment_provider === 'paypal') {
      // PayPal is the one rail here with a queryable order and a capture window
      // that outlives our TTL. Lemon Squeezy hands back no checkout id we can
      // interrogate, and Binance Pay already sends a terminal PAY_CLOSED that
      // the dispatcher turns into payment.failed — for both, a lapsed TTL with
      // no terminal event is as much as we will ever know.
      //
      // Only `dead` expires. `settled` was just dispatched, `in_flight` is money
      // still moving, and `unknown` is PayPal not answering — none of those is
      // an abandonment.
      if ((await reconcilePayPalCheckout(admin, row)) !== 'dead') {
        recovered.push(row.transaction_id)
        continue
      }
    }
    expired.push(row)
  }

  if (expired.length > 0) {
    const ids = expired.map(row => row.transaction_id)
    // 'canceled', NOT 'failed': trigger_manage_transactions runs
    // cancel_subscription(user, plan) on a 'failed' plan row, so expiring an
    // abandoned RENEWAL checkout as 'failed' would cancel the subscription the
    // buyer is still paying for. The `.eq('status','pending')` guard keeps this
    // safe against a webhook that settled the row since the SELECT above.
    const { data: updated, error: updateError } = await admin
      .from('transactions')
      .update({ status: 'canceled', expired_at: now })
      .in('transaction_id', ids)
      .eq('status', 'pending')
      .select('transaction_id')

    if (updateError) {
      console.error('[expire-stale-checkouts] update failed:', updateError)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    // Report only what the DB actually expired — a row a webhook settled
    // between the SELECT and the UPDATE is not an abandonment.
    const expiredIds = new Set((updated ?? []).map(r => r.transaction_id))
    expiredCount = expiredIds.size
    for (const row of expired) {
      if (!expiredIds.has(row.transaction_id)) continue
      await track(
        ANALYTICS_EVENTS.CHECKOUT_ABANDONED,
        {
          provider: row.payment_provider ?? 'unknown',
          amount: Number(row.amount ?? 0),
          currency: row.currency ?? 'usd',
          is_subscription: !!row.plan_id,
          transaction_id: row.transaction_id,
          ...(row.product_id ? { product_id: row.product_id } : {}),
          ...(row.plan_id ? { plan_id: row.plan_id } : {}),
          // How long the buyer had. Makes a TTL that is too aggressive visible
          // as a cluster of abandonments at exactly the TTL boundary.
          age_minutes: Math.round(
            (Date.parse(now) - Date.parse(row.transaction_date)) / 60_000,
          ),
        },
        // Backdated to when the checkout started, so the funnel attributes the
        // abandonment to the day of the attempt rather than the day we noticed.
        { userId: row.user_id, tenantId: row.tenant_id, timestamp: row.transaction_date },
      )
    }
  }

  // `stale_pending` is the queue depth AFTER this pass: a number that keeps
  // climbing means reconciliation is failing (provider outage, bad credentials),
  // which job-success alerting alone would never surface.
  const { count: remaining } = await admin
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .not('checkout_expires_at', 'is', null)
    .lt('checkout_expires_at', new Date().toISOString())

  const result = {
    scanned: rows.length,
    recovered: recovered.length,
    // What the DB actually expired, not what this pass selected — the two
    // differ whenever a webhook settled a row mid-pass.
    expired: expiredCount,
    stale_pending: remaining ?? 0,
  }
  console.log('[expire-stale-checkouts]', result)
  return NextResponse.json(result)
}
