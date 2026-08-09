import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { renewalReminderTemplate } from '@/lib/email/templates/renewal-reminder'
import { planDowngradedTemplate } from '@/lib/email/templates/plan-downgraded'
import { downgradeTenantToFree } from '@/lib/billing/downgrade-tenant'
import { getTenantAdminEmails } from '@/lib/billing/tenant-admins'
import { paymentRequestExpiredTemplate } from '@/lib/email/templates/payment-request-expired'
import {
  EXPIRABLE_REQUEST_STATUSES,
  OPEN_REQUEST_STATUSES,
  REQUEST_TTL_DAYS,
  isRequestOpen,
} from '@/lib/billing/payment-request-ttl'
import { PLATFORM_SELF_MANAGED_PROVIDERS } from '@/lib/billing/platform-billing'
import {
  abandonPlatformSubscriptionSwitch,
  reconcilePlatformSubscriptionSwitch,
} from '@/lib/billing/platform-subscription-switch'

export const runtime = 'nodejs'

/**
 * Cron job: expire lapsed manual-transfer platform subscriptions (school → platform).
 *
 * Runs daily via Vercel Cron / self-hosted crontab (see vercel.json + docs/DEPLOYMENT.md).
 * Replaces the pg_cron function handle_manual_subscription_expiry() (retired in
 * migration 20260719120000) so the flow lives in the app layer, where it can send
 * admin emails and honor pending renewal requests — neither of which SQL could do.
 *
 * Scope: every rail whose billing period WE own — `manual`, plus the crypto
 * rails opened to platform billing in #610 (Binance Pay, Solana), which have no
 * subscription object to renew and no renewal webhook to hear it from. The set
 * is derived from `selfManagedPeriod` rather than listed here, because a
 * hardcoded 'manual' is exactly what left the first non-manual self-managed
 * subscription active forever: unreminded, ungraced and never downgraded.
 *
 * Rails that renew themselves (Stripe, Lemon Squeezy, PayPal) stay
 * webhook-driven and must NOT appear here — their expiry is decided by
 * /api/billing/webhook/[provider]. So does `solana_subs`, whose crank cron
 * charges it each period.
 *
 * Phases (all status-gated, so re-running is idempotent):
 *   0. Request TTL — open payment request past `expires_at` → `expired` + email.
 *                    Runs first so a lapsed request cannot pause phase 3 below.
 *   1. Reminder    — active sub, period end within GRACE_DAYS, reminder not yet sent → email + stamp.
 *   2. Grace start — active sub, not cancel_at_period_end, period end passed → past_due + grace window + overdue email.
 *   3. Downgrade   — past_due sub, grace window passed → downgrade to free + email,
 *                    UNLESS an OPEN renewal payment request pauses it.
 *   4. Cancel      — cancel_at_period_end sub, period end passed → downgrade to free + email (no renewal pause).
 *   5. Cleanup     — retry a small bounded batch of superseded-provider cancels.
 *
 * Secured by CRON_SECRET env var (set the same value in the cron scheduler).
 */

const GRACE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

// Email sends must never abort a transition; failures are logged and swallowed.
async function safeEmail(emails: string[], template: { subject: string; html: string }): Promise<void> {
  for (const to of emails) {
    try {
      await sendEmail({ to, ...template })
    } catch (err) {
      console.error('expire-platform-subscriptions: email send failed', err)
    }
  }
}

type SubRow = {
  tenant_id: string
  current_period_end: string | null
  tenants: { name: string | null } | null
  platform_plans: { name: string | null } | null
}

const SUB_SELECT = 'tenant_id, current_period_end, tenants(name), platform_plans(name)'

type LapsedRequestRow = {
  request_id: string
  tenant_id: string
  amount: number | string | null
  currency: string | null
  expires_at: string | null
  status: string
  switch_id: string | null
  tenants: { name: string | null } | null
  platform_plans: { name: string | null } | null
}

function formatAmount(amount: number | string | null, currency: string | null): string {
  const value = Number(amount ?? 0)
  const code = (currency || 'usd').toUpperCase()
  return `${Number.isFinite(value) ? value.toFixed(2) : '0.00'} ${code}`
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date()
  const nowIso = now.toISOString()
  const reminderHorizon = new Date(now.getTime() + GRACE_DAYS * DAY_MS).toISOString()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
  const billingUrl = `${appUrl}/dashboard/admin/billing`

  const result = {
    requestsExpired: 0,
    reminded: 0,
    graceStarted: 0,
    downgraded: 0,
    canceled: 0,
    skippedPendingRenewal: 0,
    switchesAbandoned: 0,
    switchCancellationsCompleted: 0,
    switchCancellationsScheduled: 0,
    switchCancellationRetries: 0,
  }

  // ---- Switch abandonment (#621) ----
  // A replacement checkout that never activates expires without touching the
  // source entitlement. Validated late payments may revive these rows through
  // the source-snapshot-guarded promotion RPC.
  const { data: abandonedSwitches } = await supabase
    .from('platform_subscription_switches')
    .update({ state: 'abandoned', updated_at: nowIso })
    .eq('state', 'pending_activation')
    .lt('expires_at', nowIso)
    .select('switch_id')
    .limit(100)
  result.switchesAbandoned = abandonedSwitches?.length ?? 0

  // ---- Phase 0: expire lapsed payment requests (#546 §2) ----
  // Nothing else in the codebase ever moved a request out of an open state, so
  // an unpaid renewal paused the downgrade forever: click "request renewal",
  // never pay, keep the paid plan, its limits and its reduced platform fee.
  // Closing them here first means phase 3 below sees the swept state.
  const { data: lapsedRequests } = await supabase
    .from('platform_payment_requests')
    .select('request_id, tenant_id, amount, currency, expires_at, status, switch_id, tenants(name), platform_plans(name)')
    .in('status', EXPIRABLE_REQUEST_STATUSES as unknown as string[])
    .not('expires_at', 'is', null)
    .lt('expires_at', nowIso)

  for (const req of (lapsedRequests as LapsedRequestRow[] | null) || []) {
    const { data: expiredRequest, error } = await supabase
      .from('platform_payment_requests')
      .update({ status: 'expired', updated_at: nowIso })
      .eq('request_id', req.request_id)
      // Status-gated so a super admin confirming in the same instant wins.
      .in('status', EXPIRABLE_REQUEST_STATUSES as unknown as string[])
      .select('request_id')
      .maybeSingle()

    if (error) {
      console.error('expire-platform-subscriptions: failed to expire request', req.request_id, error)
      continue
    }
    if (!expiredRequest) continue

    await abandonPlatformSubscriptionSwitch(
      supabase,
      req.switch_id,
      'Linked payment request expired',
    )

    const emails = await getTenantAdminEmails(supabase, req.tenant_id)
    await safeEmail(emails, paymentRequestExpiredTemplate({
      schoolName: req.tenants?.name || 'your school',
      planName: req.platform_plans?.name || 'your plan',
      amount: formatAmount(req.amount, req.currency),
      billingUrl,
      ttlDays: REQUEST_TTL_DAYS,
    }))
    result.requestsExpired++
  }

  // ---- Phase 1: pre-expiry renewal reminder ----
  const { data: reminderSubs } = await supabase
    .from('platform_subscriptions')
    .select(SUB_SELECT)
    .in('payment_provider', PLATFORM_SELF_MANAGED_PROVIDERS)
    .eq('status', 'active')
    .eq('cancel_at_period_end', false)
    .is('renewal_reminder_sent_at', null)
    .not('current_period_end', 'is', null)
    .lte('current_period_end', reminderHorizon)
    .gte('current_period_end', nowIso)

  for (const sub of (reminderSubs as SubRow[] | null) || []) {
    const emails = await getTenantAdminEmails(supabase, sub.tenant_id)
    await safeEmail(emails, renewalReminderTemplate({
      schoolName: sub.tenants?.name || 'your school',
      planName: sub.platform_plans?.name || 'your plan',
      billingUrl,
      periodEnd: new Date(sub.current_period_end!).toLocaleDateString('en-US', { dateStyle: 'long' }),
      overdue: false,
    }))
    await supabase
      .from('platform_subscriptions')
      .update({ renewal_reminder_sent_at: nowIso, updated_at: nowIso })
      .eq('tenant_id', sub.tenant_id)
    result.reminded++
  }

  // ---- Phase 2: grace start (period lapsed → past_due) ----
  const { data: lapsedSubs } = await supabase
    .from('platform_subscriptions')
    .select(SUB_SELECT)
    .in('payment_provider', PLATFORM_SELF_MANAGED_PROVIDERS)
    .eq('status', 'active')
    .eq('cancel_at_period_end', false)
    .not('current_period_end', 'is', null)
    .lt('current_period_end', nowIso)

  // Tenants that entered grace in THIS pass. Phase 3 re-queries the table and
  // would otherwise see them; belt-and-braces alongside the graceEnd fix below,
  // so "started grace" and "downgraded" can never both happen to one school in
  // a single run no matter how the arithmetic drifts.
  const graceStartedNow = new Set<string>()

  for (const sub of (lapsedSubs as SubRow[] | null) || []) {
    // Grace starts NOW, not at the (possibly long-past) period end (#546 §4).
    // Computing it from current_period_end meant that after a cron outage of
    // more than GRACE_DAYS the window was already closed the moment it opened:
    // the same request sent "your payment is overdue" and "you have been
    // downgraded", with no opportunity to pay. Both counters incremented, so
    // the response looked healthy.
    const periodEndMs = new Date(sub.current_period_end!).getTime()
    const graceEnd = new Date(Math.max(periodEndMs, now.getTime()) + GRACE_DAYS * DAY_MS).toISOString()
    await supabase
      .from('platform_subscriptions')
      .update({ status: 'past_due', grace_period_end: graceEnd, updated_at: nowIso })
      .eq('tenant_id', sub.tenant_id)
    await supabase
      .from('tenants')
      .update({ billing_status: 'past_due', updated_at: nowIso })
      .eq('id', sub.tenant_id)

    const emails = await getTenantAdminEmails(supabase, sub.tenant_id)
    await safeEmail(emails, renewalReminderTemplate({
      schoolName: sub.tenants?.name || 'your school',
      planName: sub.platform_plans?.name || 'your plan',
      billingUrl,
      periodEnd: new Date(sub.current_period_end!).toLocaleDateString('en-US', { dateStyle: 'long' }),
      overdue: true,
    }))
    graceStartedNow.add(sub.tenant_id)
    result.graceStarted++
  }

  // ---- Phase 3: downgrade after grace (unless a renewal is pending) ----
  const { data: expiredSubs } = await supabase
    .from('platform_subscriptions')
    .select(SUB_SELECT)
    .in('payment_provider', PLATFORM_SELF_MANAGED_PROVIDERS)
    .eq('status', 'past_due')
    .not('grace_period_end', 'is', null)
    .lt('grace_period_end', nowIso)

  for (const sub of (expiredSubs as SubRow[] | null) || []) {
    // A school that only just entered grace gets the full window, never a
    // same-pass downgrade.
    if (graceStartedNow.has(sub.tenant_id)) continue

    // Pause the downgrade only for a renewal request that is still OPEN — an
    // unpaid one lapses at its TTL (phase 0 above) and stops holding the plan.
    const { data: pendingRenewal } = await supabase
      .from('platform_payment_requests')
      .select('request_id, status, expires_at')
      .eq('tenant_id', sub.tenant_id)
      .eq('request_type', 'renewal')
      .in('status', OPEN_REQUEST_STATUSES as unknown as string[])
      .limit(20)

    const stillOpen = ((pendingRenewal as { status: string; expires_at: string | null }[] | null) || [])
      .some((r) => isRequestOpen(r, now))

    if (stillOpen) {
      result.skippedPendingRenewal++
      continue
    }

    await downgradeTenantToFree(supabase, sub.tenant_id)
    const emails = await getTenantAdminEmails(supabase, sub.tenant_id)
    await safeEmail(emails, planDowngradedTemplate({
      schoolName: sub.tenants?.name || 'your school',
      planName: sub.platform_plans?.name || 'your plan',
      billingUrl,
    }))
    result.downgraded++
  }

  // ---- Phase 4: explicit cancel-at-period-end (no renewal pause) ----
  const { data: cancelSubs } = await supabase
    .from('platform_subscriptions')
    .select(SUB_SELECT)
    .in('payment_provider', PLATFORM_SELF_MANAGED_PROVIDERS)
    .eq('status', 'active')
    .eq('cancel_at_period_end', true)
    .not('current_period_end', 'is', null)
    .lt('current_period_end', nowIso)

  for (const sub of (cancelSubs as SubRow[] | null) || []) {
    await downgradeTenantToFree(supabase, sub.tenant_id)
    const emails = await getTenantAdminEmails(supabase, sub.tenant_id)
    await safeEmail(emails, planDowngradedTemplate({
      schoolName: sub.tenants?.name || 'your school',
      planName: sub.platform_plans?.name || 'your plan',
      billingUrl,
    }))
    result.canceled++
  }

  // ---- Phase 5: bounded source-provider cleanup (#621) ----
  // External provider calls run last so a degraded API cannot starve request
  // expiry, reminders, grace transitions, or tenant downgrades. Ten per daily
  // run is enough to drain normal volume without consuming the route budget.
  const { data: cleanupSwitches } = await supabase
    .from('platform_subscription_switches')
    .select('switch_id')
    .in('state', ['cancellation_pending', 'cancellation_retry'])
    .lte('next_retry_at', nowIso)
    .order('next_retry_at', { ascending: true })
    .limit(10)

  for (const row of cleanupSwitches || []) {
    const outcome = await reconcilePlatformSubscriptionSwitch(supabase, row.switch_id)
    if (outcome === 'completed') result.switchCancellationsCompleted++
    else if (outcome === 'scheduled') result.switchCancellationsScheduled++
    else if (outcome === 'retry') result.switchCancellationRetries++
  }

  return NextResponse.json({ success: true, ...result })
}
