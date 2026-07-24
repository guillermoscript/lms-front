import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { renewalReminderTemplate } from '@/lib/email/templates/renewal-reminder'
import { planDowngradedTemplate } from '@/lib/email/templates/plan-downgraded'
import { downgradeTenantToFree } from '@/lib/billing/downgrade-tenant'
import { getTenantAdminEmails } from '@/lib/billing/tenant-admins'

export const runtime = 'nodejs'

/**
 * Cron job: expire lapsed manual-transfer platform subscriptions (school → platform).
 *
 * Runs daily via Vercel Cron / self-hosted crontab (see vercel.json + docs/DEPLOYMENT.md).
 * Replaces the pg_cron function handle_manual_subscription_expiry() (retired in
 * migration 20260719120000) so the flow lives in the app layer, where it can send
 * admin emails and honor pending renewal requests — neither of which SQL could do.
 *
 * Scope: only payment_method='manual_transfer'. Stripe platform subs stay
 * webhook-driven; their expiry is handled by /api/stripe/platform-webhook.
 *
 * Phases (all status-gated, so re-running is idempotent):
 *   1. Reminder    — active sub, period end within GRACE_DAYS, reminder not yet sent → email + stamp.
 *   2. Grace start — active sub, not cancel_at_period_end, period end passed → past_due + grace window + overdue email.
 *   3. Downgrade   — past_due sub, grace window passed → downgrade to free + email,
 *                    UNLESS a renewal payment request is still pending (pauses the downgrade).
 *   4. Cancel      — cancel_at_period_end sub, period end passed → downgrade to free + email (no renewal pause).
 *
 * Secured by CRON_SECRET env var (set the same value in the cron scheduler).
 */

const GRACE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

// A renewal in any of these states means the school is mid-renewal; don't downgrade.
const PENDING_RENEWAL_STATUSES = ['pending', 'instructions_sent', 'payment_received']

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

  const result = { reminded: 0, graceStarted: 0, downgraded: 0, canceled: 0, skippedPendingRenewal: 0 }

  // ---- Phase 1: pre-expiry renewal reminder ----
  const { data: reminderSubs } = await supabase
    .from('platform_subscriptions')
    .select(SUB_SELECT)
    .eq('payment_method', 'manual_transfer')
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
    .eq('payment_method', 'manual_transfer')
    .eq('status', 'active')
    .eq('cancel_at_period_end', false)
    .not('current_period_end', 'is', null)
    .lt('current_period_end', nowIso)

  for (const sub of (lapsedSubs as SubRow[] | null) || []) {
    const graceEnd = new Date(new Date(sub.current_period_end!).getTime() + GRACE_DAYS * DAY_MS).toISOString()
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
    result.graceStarted++
  }

  // ---- Phase 3: downgrade after grace (unless a renewal is pending) ----
  const { data: expiredSubs } = await supabase
    .from('platform_subscriptions')
    .select(SUB_SELECT)
    .eq('payment_method', 'manual_transfer')
    .eq('status', 'past_due')
    .not('grace_period_end', 'is', null)
    .lt('grace_period_end', nowIso)

  for (const sub of (expiredSubs as SubRow[] | null) || []) {
    // Pause the downgrade if the school has a renewal request in flight.
    const { data: pendingRenewal } = await supabase
      .from('platform_payment_requests')
      .select('request_id')
      .eq('tenant_id', sub.tenant_id)
      .eq('request_type', 'renewal')
      .in('status', PENDING_RENEWAL_STATUSES)
      .limit(1)

    if (pendingRenewal && pendingRenewal.length > 0) {
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
    .eq('payment_method', 'manual_transfer')
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

  return NextResponse.json({ success: true, ...result })
}
