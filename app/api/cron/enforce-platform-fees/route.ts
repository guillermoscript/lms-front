import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { getTenantAdminEmails } from '@/lib/billing/tenant-admins'
import { resolveTenantLocale } from '@/lib/i18n/tenant-locale'
import { tenantBaseUrl } from '@/lib/notifications/daily-digest'
import {
  createSupabaseFeeStore,
  runPlatformFeeEnforcement,
} from '@/lib/billing/platform-fee-enforcement'

export const runtime = 'nodejs'

/**
 * Cron job: platform fee dunning (#929, docs/PLATFORM_FEE_LEDGER_DESIGN.md §3).
 *
 * Closes last month's NON-FISCAL fee statements, reminds the day before they
 * fall due, marks schools overdue, and — only when
 * `platform_fee_config.enforcement_mode = 'enforce'` — pauses NEW sales after
 * the grace period by setting `tenant_fee_standing.blocked_at`. `notify_only`
 * (the shipped mode) sends notices and never sets `blocked_at`; `off` is a
 * no-op. Every phase is status-gated, so the documented pg_cron + GitHub
 * double fire is safe. The work lives in lib/billing/platform-fee-enforcement.ts.
 *
 * `?dryRun=1` returns the would-act set and writes nothing (required before
 * the first production enable).
 *
 * Scheduled by pg_cron (`enforce-platform-fees-daily`, 0 5 * * *, through
 * invoke_cron_route) with .github/workflows/cron.yml at 0 6 as the fallback.
 * Secured by CRON_SECRET (Authorization: Bearer).
 */

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRunParam = req.nextUrl.searchParams.get('dryRun')
  const dryRun = dryRunParam === '1' || dryRunParam === 'true'

  try {
    const store = createSupabaseFeeStore(getSupabaseAdmin(), {
      adminEmails: getTenantAdminEmails,
      locale: resolveTenantLocale,
    })
    const result = await runPlatformFeeEnforcement(store, {
      dryRun,
      sendEmail,
      tenantUrl: tenantBaseUrl,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('enforce-platform-fees: run failed', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'enforce-platform-fees failed' },
      { status: 500 },
    )
  }
}

/**
 * Sentry cron monitor `cron-enforce-platform-fees`. pg_cron is the primary
 * scheduler and cannot talk to Sentry, so the route checks in itself (no-op
 * without a DSN). A dry run is an operator check, not a scheduled tick, so it
 * does not check in.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.has('dryRun')) return run(req)
  return Sentry.withMonitor('cron-enforce-platform-fees', () => run(req), {
    schedule: { type: 'crontab', value: '0 5 * * *' },
    checkinMargin: 120,
    maxRuntime: 20,
    timezone: 'Etc/UTC',
  })
}
