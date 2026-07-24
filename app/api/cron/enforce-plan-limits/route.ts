import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { reconcileAccessCutoff } from '@/lib/billing/access-cutoff'

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

  const { data: tenants } = await supabase.from('tenants').select('id')

  const result = { scheduled: 0, cleared: 0, none: 0, errors: 0 }

  for (const tenant of tenants || []) {
    try {
      const decision = await reconcileAccessCutoff(supabase, tenant.id)
      if (decision.action === 'schedule') result.scheduled++
      else if (decision.action === 'clear') result.cleared++
      else result.none++
    } catch (err) {
      console.error('enforce-plan-limits: reconcile failed for tenant', tenant.id, err)
      result.errors++
    }
  }

  return NextResponse.json({ success: true, ...result })
}
