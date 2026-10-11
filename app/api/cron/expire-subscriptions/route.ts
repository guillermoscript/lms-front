import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

/**
 * Cron job: expire subscriptions whose billing period has ended.
 *
 * Run daily via Vercel Cron (configured in vercel.json).
 * The DB trigger `on_subscription_status_change` (handle_subscription_status_change)
 * automatically revokes linked entitlements when status → 'expired' / 'canceled'.
 *
 * CAPABILITY-AWARE: unscheduled expiry is limited to self-managed periods.
 * Scheduled cancellation on every provider uses the shared paid-access deadline.
 * Push-renewal providers (Stripe, PayPal, Lemon Squeezy — `emitsRenewalWebhooks`)
 * MUST NOT be expired here: their webhooks drive state, and a delayed renewal
 * webhook would otherwise let the cron prematurely kill a still-paying sub.
 * Providers WE own the period for (one-time Solana, manual, mock/legacy NULL) are the
 * ones that must be cron-expired when their period lapses. We gate on the
 * capability flag, never on provider name.
 *
 * Secured by CRON_SECRET env var (set the same value in Vercel dashboard).
 */

/**
 * Whether a subscription with this payment_provider should be expired by the
 * cron. True for self-managed-period providers; false for push-renewal ones.
 * Unknown / NULL provider (legacy mock rows) defaults to true — they have no
 * renewal webhook, so the cron is their only expiry path.
 */
function isCronExpirable(paymentProvider: string | null): boolean {
  if (!paymentProvider) return true
  const caps = PROVIDER_CAPABILITIES[paymentProvider as PaymentProvider]
  if (!caps) return true
  // Skip any provider with an automatic renewal mechanism: push-renewal
  // webhooks (Stripe/PayPal/LS) OR native auto-pull (solana_subs crank). Only
  // pure self-managed providers (one-time Solana, manual, mock) are expired here.
  return !(caps.emitsRenewalWebhooks || caps.supportsNativeSubscriptions)
}
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  // Find subscriptions that:
  // 1. Still have a live subscription status
  // 2. Have a current_period_end in the past (or end_date, whichever is later)
  const { data: expired, error } = await supabase
    .from('subscriptions')
    .select('subscription_id, user_id, tenant_id, current_period_end, end_date, payment_provider, cancel_at_period_end')
    .in('subscription_status', ['active', 'renewed', 'past_due'])
    .or(`current_period_end.lt.${now},end_date.lt.${now}`)

  if (error) {
    console.error('expire-subscriptions cron: query error', error)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ expired: 0 })
  }

  // Filter: only expire if BOTH period_end and end_date are in the past (or null)
  // This avoids expiring subs that were renewed but have a stale end_date.
  // Skip automatic renewal providers unless cancellation is scheduled.
  const toExpire = expired.filter(sub => {
    // Every scheduled cancellation uses the shared paid-access deadline,
    // whether billing ended immediately or was scheduled at the provider.
    const appOwnsCancel = !!sub.cancel_at_period_end
    if (!isCronExpirable(sub.payment_provider) && !appOwnsCancel) return false
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
    const endDate = sub.end_date ? new Date(sub.end_date) : null
    const cutoff = new Date(now)
    // Expire if the most recent of the two dates is in the past
    const latestEnd = periodEnd && endDate
      ? (periodEnd > endDate ? periodEnd : endDate)
      : (periodEnd || endDate)
    return latestEnd ? latestEnd < cutoff : false
  })

  if (toExpire.length === 0) {
    return NextResponse.json({ expired: 0 })
  }

  const ids: number[] = []
  for (const sub of toExpire) {
    // Recheck under a row lock; the queue snapshot can race with renewal.
    const { data: didExpire, error: updateError } = await supabase.rpc('expire_subscription_if_due', {
      _subscription_id: sub.subscription_id,
      _allow_unscheduled: isCronExpirable(sub.payment_provider),
    })
    if (updateError) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    if (didExpire) ids.push(sub.subscription_id)
  }
  console.log(`expire-subscriptions cron: expired ${ids.length} subscriptions`, ids)

  // Loop E, LEARNER side — `scope` separates it from the platform subscriptions
  // expired by the sibling cron, which are a different business entirely.
  // This is the terminal churn event: `student_subscription_cancel_confirmed`
  // records the intent, this records the day access actually stopped.
  //
  // Emitted only for rows the locked expiry operation actually ended.
  // A concurrent renewal may make the queued deadline stale; it emits nothing.
  for (const sub of toExpire.filter((row) => ids.includes(row.subscription_id))) {
    await track(
      ANALYTICS_EVENTS.SUBSCRIPTION_EXPIRED,
      {
        scope: 'student',
        provider: sub.payment_provider ?? 'unknown',
        subscription_id: sub.subscription_id,
        period_end: sub.current_period_end,
        end_date: sub.end_date,
        // Learner subscriptions have no grace window — that is a platform
        // billing concept — so this is always false here, and stated rather
        // than omitted so the property is comparable across both scopes.
        was_grace: false,
      },
      { userId: sub.user_id, tenantId: sub.tenant_id },
    )
  }

  return NextResponse.json({ expired: ids.length, ids })
}

export const runtime = 'nodejs'
