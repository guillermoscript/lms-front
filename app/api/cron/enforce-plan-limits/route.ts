import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { reconcileAccessCutoff } from '@/lib/billing/access-cutoff'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'

export const runtime = 'nodejs'

/**
 * Cron job: daily sweep reconciling access-cutoff state for every tenant (issue #494).
 *
 * `reconcileAccessCutoff()` is already called from event-driven sites —
 * `downgradeTenantToFree()`, `changePlan()`, `confirmManualPayment()`, and
 * `applyPortalPlanChange()` — but none of those fire for a tenant that simply
 * grows over its own plan's limits organically (e.g. a free-plan school that
 * accumulates students with no plan-change event at all). This cron closes
 * that gap by walking every tenant once a day and reconciling
 * `tenants.access_cutoff_at` against its current plan/usage, regardless of
 * plan (a free-plan tenant needs this as much as a paid one).
 *
 * It is also the only thing that runs repeatedly while a cutoff is pending,
 * which makes it the right home for the #517 reminder ladder: `notifyDueStages`
 * tells the reconciler to send whichever rung (T-7, T-1, or the day access
 * actually stops) is due and not yet in the `access_cutoff_notifications`
 * ledger. That is why no separate cron entry was added — the sweep that
 * already visits every tenant daily is exactly the cadence the ladder needs.
 *
 * `notified` / `notifyFailures` in the response make send health visible:
 * before #517 a failing mail provider left the schedule in place and said
 * nothing, so the school's first signal was students losing access.
 *
 * Secured by CRON_SECRET env var (set the same value in the cron scheduler).
 */

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // Paged and verified rather than read in one shot (issue #533). A PostgREST
  // row cap would truncate this list into a plain short array, and since the
  // sweep's only job is to visit EVERY tenant, the tail would simply stop being
  // reconciled with nothing in the response to say so — silently disabling the
  // organic-growth trigger this cron exists to be. An incomplete read now fails
  // the run loudly so the scheduler surfaces it.
  let tenants: { id: string }[]
  try {
    tenants = await fetchAllRows<{ id: string }>('tenants', (from, to) =>
      supabase.from('tenants').select('id', { count: 'exact' }).order('id').range(from, to)
    )
  } catch (err) {
    console.error('enforce-plan-limits: could not read the tenant list', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read tenants' },
      { status: 500 }
    )
  }

  const result = {
    scheduled: 0,
    cleared: 0,
    none: 0,
    errors: 0,
    /** Reminder-ladder rungs delivered this run, keyed by stage (#517). */
    notified: {} as Record<string, number>,
    /** Tenants where a rung was due but nobody received it; retried tomorrow. */
    notifyFailures: 0,
  }

  for (const tenant of tenants) {
    try {
      const decision = await reconcileAccessCutoff(supabase, tenant.id, { notifyDueStages: true })
      if (decision.action === 'schedule') result.scheduled++
      else if (decision.action === 'clear') result.cleared++
      else result.none++

      if (decision.notifiedStage) {
        result.notified[decision.notifiedStage] = (result.notified[decision.notifiedStage] ?? 0) + 1
      }
      if (decision.notifyFailed) result.notifyFailures++
    } catch (err) {
      console.error('enforce-plan-limits: reconcile failed for tenant', tenant.id, err)
      result.errors++
    }
  }

  return NextResponse.json({ success: true, ...result })
}
