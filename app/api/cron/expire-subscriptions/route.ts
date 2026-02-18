import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
 * The DB trigger `trigger_deactivate_enrollments_on_subscription_end`
 * automatically disables linked enrollments when status → 'expired'.
 *
 * Secured by CRON_SECRET env var (set the same value in Vercel dashboard).
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  // Find subscriptions that:
  // 1. Are still marked 'active'
  // 2. Have a current_period_end in the past (or end_date, whichever is later)
  const { data: expired, error } = await supabase
    .from('subscriptions')
    .select('subscription_id, user_id, tenant_id, current_period_end, end_date')
    .eq('subscription_status', 'active')
    .or(`current_period_end.lt.${now},end_date.lt.${now}`)

  if (error) {
    console.error('expire-subscriptions cron: query error', error)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ expired: 0 })
  }

  // Filter: only expire if BOTH period_end and end_date are in the past (or null)
  // This avoids expiring subs that were renewed but have a stale end_date
  const toExpire = expired.filter(sub => {
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

  const ids = toExpire.map(s => s.subscription_id)

  // Update to 'expired' — DB trigger fires and disables enrollments for each
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({ subscription_status: 'expired' })
    .in('subscription_id', ids)

  if (updateError) {
    console.error('expire-subscriptions cron: update error', updateError)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  console.log(`expire-subscriptions cron: expired ${toExpire.length} subscriptions`, ids)

  return NextResponse.json({ expired: toExpire.length, ids })
}

export const runtime = 'nodejs'
