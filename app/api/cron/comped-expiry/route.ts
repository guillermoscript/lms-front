import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { compedExpiryNoticeTemplate } from '@/lib/email/templates/comped-expiry-notice'
import { getTenantAdmins } from '@/lib/billing/tenant-admins'
import { dueNoticeWindow, isExpired, type NoticeSentMap } from '@/lib/billing/comped-expiry'
import { compedEndedCopy, compedNoticeCopy, formatCompedDate } from '@/lib/billing/comped-expiry-copy'
import { PLATFORM_APP_CANCELED_PROVIDERS, PLATFORM_SELF_MANAGED_PROVIDERS } from '@/lib/billing/platform-billing'
import { parseDryRunParam } from '@/lib/billing/platform-fee-enforcement'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { resolveTenantLocale } from '@/lib/i18n/tenant-locale'
import { writeUserNotification } from '@/lib/notifications/member-notice'

export const runtime = 'nodejs'

/**
 * Cron job: comped-school expiry lifecycle (issue #983, docs/INTERNAL_COMPED_SCHOOLS.md).
 *
 * Phase 1 - notices. A `comped` school with `comped_until` within 30 days gets
 *   ONE notice per reached window (30 / 14 / 3 days; see lib/billing/comped-expiry.ts):
 *   email + in-app to every active tenant admin, email to the platform owners
 *   (`super_admins`). Idempotent through `tenants.comped_notice_sent`.
 *   CLAIM-THEN-SEND: the window is stamped with a conditional UPDATE
 *   (`comped_notice_sent->>'<w>' IS NULL`) BEFORE anything is sent, so two
 *   concurrent runs cannot both send. If nothing at all was delivered (no
 *   recipient, mailer down and in-app failed) the stamp is RELEASED so the next
 *   daily run retries; once at least one recipient got it, the window stays
 *   claimed (a partial failure is logged, never re-sent to the ones who got it).
 *
 * Phase 2 - expiry. `comped` and `comped_until <= now` -> `billing_mode='paid'`,
 *   comp metadata and fee override cleared (same fields as convertCompedTenantToPaid),
 *   status-gated on `billing_mode='comped'` so re-runs are no-ops. The
 *   subscription lifecycle (expire-platform-subscriptions) then owns the school,
 *   but it only acts on a `past_due` row with a `grace_period_end`, and a comped
 *   school has either an override row with NULL current_period_end (never reminded,
 *   never lapses) or no/canceled row. So this phase STARTS the 7-day grace itself,
 *   exactly as expire-platform-subscriptions phase 2 does (status past_due,
 *   grace_period_end = now + 7d, tenants.billing_status past_due); phase 3 of that
 *   cron then runs the normal downgradeTenantToFree after the window, unless a
 *   renewal request is open. A school already on `free`, or with a live paid cycle,
 *   needs no grace. If stamping the grace fails, the flip is reverted so the next
 *   run retries (never a paid school with a paid plan and no clock).
 *
 * `?dryRun=1` reports what would happen and writes/sends nothing.
 * Secured by CRON_SECRET (same value as the scheduler).
 */

const GRACE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

type CompedTenant = {
  id: string
  name: string | null
  plan: string | null
  comped_until: string | null
  comped_notice_sent: NoticeSentMap | null
  comped_reason: string | null
  comped_by: string | null
  comped_at: string | null
  fee_percent_override: number | null
}

type Recipient = { userId: string | null; email: string | null }

async function ownerEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('super_admins').select('user_id')
  const emails: string[] = []
  for (const row of (data as { user_id: string }[] | null) || []) {
    const { data: authUser } = await supabase.auth.admin.getUserById(row.user_id)
    if (authUser?.user?.email) emails.push(authUser.user.email)
  }
  return emails
}

async function trySend(to: string, template: { subject: string; html: string }): Promise<boolean> {
  try {
    return await sendEmail({ to, ...template })
  } catch (err) {
    console.error('comped-expiry: email send failed', err)
    return false
  }
}

async function runSweep(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = parseDryRunParam(req.nextUrl?.searchParams ?? new URLSearchParams())
  const supabase = getSupabaseAdmin()
  const now = new Date()
  const nowIso = now.toISOString()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
  const upgradeUrl = `${appUrl}/dashboard/admin/billing/upgrade`
  const upgradePath = '/dashboard/admin/billing/upgrade'

  const result = {
    dryRun,
    notices: { '30': 0, '14': 0, '3': 0 } as Record<string, number>,
    noticeFailures: 0,
    expired: 0,
    graceStarted: 0,
    errors: 0,
  }

  let tenants: CompedTenant[]
  try {
    tenants = await fetchAllRows<CompedTenant>('tenants(comped)', (from, to) =>
      supabase
        .from('tenants')
        .select(
          'id, name, plan, comped_until, comped_notice_sent, comped_reason, comped_by, comped_at, fee_percent_override',
          { count: 'exact' }
        )
        .eq('billing_mode', 'comped')
        .not('comped_until', 'is', null)
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: CompedTenant[] | null; error: { message: string } | null; count: number | null }>
    )
  } catch (err) {
    console.error('comped-expiry: could not read comped tenants', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'read failed' }, { status: 500 })
  }

  const { data: planRows } = await supabase.from('platform_plans').select('plan_id, slug, name')
  const plans = (planRows as { plan_id: string; slug: string; name: string | null }[] | null) || []
  const planName = (slug: string | null) => plans.find((p) => p.slug === slug)?.name || slug || 'plan'

  let owners: string[] | null = null
  const getOwners = async () => (owners ??= await ownerEmails(supabase))

  // ---- Phase 1: 30 / 14 / 3 day notices ----
  for (const tenant of tenants) {
    try {
      const due = dueNoticeWindow({ compedUntil: tenant.comped_until, sentMap: tenant.comped_notice_sent, now })
      if (!due) continue
      const key = String(due.window)

      if (dryRun) {
        result.notices[key] = (result.notices[key] ?? 0) + 1
        continue
      }

      const previous: NoticeSentMap = tenant.comped_notice_sent ?? {}
      const merged: NoticeSentMap = { ...previous }
      for (const w of due.covers) merged[String(w)] = nowIso

      // Claim first. Zero rows = another run claimed it (or the school stopped being comped).
      const { data: claimed, error: claimError } = await supabase
        .from('tenants')
        .update({ comped_notice_sent: merged })
        .eq('id', tenant.id)
        .eq('billing_mode', 'comped')
        .is(`comped_notice_sent->>${key}`, null)
        .select('id')
      if (claimError) {
        console.error('comped-expiry: claim failed', tenant.id, claimError)
        result.errors++
        continue
      }
      if (!claimed || claimed.length === 0) continue

      const locale = await resolveTenantLocale(supabase, tenant.id)
      const schoolName = tenant.name || 'your school'
      const plan = planName(tenant.plan)
      const copy = compedNoticeCopy(locale, {
        schoolName,
        planName: plan,
        date: formatCompedDate(tenant.comped_until!, locale),
        daysRemaining: due.daysRemaining,
      })
      const emailData = {
        schoolName,
        planName: plan,
        expiryDate: formatCompedDate(tenant.comped_until!, 'en'),
        daysRemaining: due.daysRemaining,
        billingUrl: upgradeUrl,
      }

      let delivered = 0
      const admins: Recipient[] = await getTenantAdmins(supabase, tenant.id)
      for (const admin of admins) {
        if (admin.userId) {
          const ok = await writeUserNotification({
            admin: supabase,
            tenantId: tenant.id,
            userId: admin.userId,
            title: copy.title,
            content: copy.content,
            type: 'warning',
            kind: 'comped_expiry',
            link: upgradePath,
          })
          if (ok) delivered++
        }
        if (admin.email && (await trySend(admin.email, compedExpiryNoticeTemplate({ ...emailData, audience: 'school' })))) {
          delivered++
        }
      }
      for (const email of await getOwners()) {
        if (await trySend(email, compedExpiryNoticeTemplate({ ...emailData, audience: 'owner' }))) delivered++
      }

      if (delivered === 0) {
        // Nothing reached anyone: release the claim so tomorrow's run retries.
        await supabase
          .from('tenants')
          .update({ comped_notice_sent: previous })
          .eq('id', tenant.id)
          .eq('billing_mode', 'comped')
        result.noticeFailures++
        console.error('comped-expiry: notice undelivered, claim released', tenant.id, key)
        continue
      }
      result.notices[key] = (result.notices[key] ?? 0) + 1
    } catch (err) {
      console.error('comped-expiry: notice failed for tenant', tenant.id, err)
      result.errors++
    }
  }

  // ---- Phase 2: expiry -> paid + start the normal 7-day grace ----
  for (const tenant of tenants) {
    if (!isExpired(tenant.comped_until, now)) continue
    try {
      if (dryRun) {
        result.expired++
        continue
      }

      const { data: flipped, error: flipError } = await supabase
        .from('tenants')
        .update({
          billing_mode: 'paid',
          comped_until: null,
          comped_reason: null,
          comped_by: null,
          comped_at: null,
          fee_percent_override: null,
          updated_at: nowIso,
        })
        .eq('id', tenant.id)
        .eq('billing_mode', 'comped')
        .lte('comped_until', nowIso)
        .select('id')
      if (flipError) {
        console.error('comped-expiry: expiry flip failed', tenant.id, flipError)
        result.errors++
        continue
      }
      if (!flipped || flipped.length === 0) continue // converted or already handled
      result.expired++

      let graceStarted = false
      try {
        graceStarted = await startGrace(supabase, tenant, plans, now)
      } catch (err) {
        console.error('comped-expiry: grace stamp failed, reverting expiry', tenant.id, err)
        await supabase
          .from('tenants')
          .update({
            billing_mode: 'comped',
            comped_until: tenant.comped_until,
            comped_reason: tenant.comped_reason,
            comped_by: tenant.comped_by,
            comped_at: tenant.comped_at,
            fee_percent_override: tenant.fee_percent_override,
          })
          .eq('id', tenant.id)
          .eq('billing_mode', 'paid')
        result.expired--
        result.errors++
        continue
      }
      if (graceStarted) result.graceStarted++

      const locale = await resolveTenantLocale(supabase, tenant.id)
      const schoolName = tenant.name || 'your school'
      const plan = planName(tenant.plan)
      const graceDays = graceStarted ? GRACE_DAYS : null
      const copy = compedEndedCopy(locale, {
        schoolName,
        planName: plan,
        date: formatCompedDate(tenant.comped_until!, locale),
        graceDays,
      })
      const emailData = {
        schoolName,
        planName: plan,
        expiryDate: formatCompedDate(tenant.comped_until!, 'en'),
        daysRemaining: 0,
        billingUrl: upgradeUrl,
        stage: 'ended' as const,
        graceDays,
      }
      for (const admin of await getTenantAdmins(supabase, tenant.id)) {
        if (admin.userId) {
          await writeUserNotification({
            admin: supabase,
            tenantId: tenant.id,
            userId: admin.userId,
            title: copy.title,
            content: copy.content,
            type: 'warning',
            kind: 'comped_expired',
            link: upgradePath,
          })
        }
        if (admin.email) await trySend(admin.email, compedExpiryNoticeTemplate({ ...emailData, audience: 'school' }))
      }
      for (const email of await getOwners()) {
        await trySend(email, compedExpiryNoticeTemplate({ ...emailData, audience: 'owner' }))
      }
    } catch (err) {
      console.error('comped-expiry: expiry failed for tenant', tenant.id, err)
      result.errors++
    }
  }

  return NextResponse.json({ success: true, ...result })
}

/**
 * Open the normal grace window for a school that just became `paid` while still
 * on a paid plan. Returns whether a grace window was stamped. Throws on a write
 * error (caller reverts the expiry).
 */
async function startGrace(
  supabase: SupabaseClient,
  tenant: CompedTenant,
  plans: { plan_id: string; slug: string }[],
  now: Date,
): Promise<boolean> {
  if (!tenant.plan || tenant.plan === 'free') return false
  const plan = plans.find((p) => p.slug === tenant.plan)
  if (!plan) return false // no plan row: paid fails closed already, nothing to downgrade

  const nowIso = now.toISOString()
  const graceEnd = new Date(now.getTime() + GRACE_DAYS * DAY_MS).toISOString()

  const { data: sub, error: subError } = await supabase
    .from('platform_subscriptions')
    .select('status, current_period_end, payment_provider')
    .eq('tenant_id', tenant.id)
    .maybeSingle()
  if (subError) throw new Error(subError.message)

  const row = sub as { status: string; current_period_end: string | null; payment_provider: string | null } | null
  if (row) {
    const liveCycle = row.status === 'active' && row.current_period_end != null && new Date(row.current_period_end) > now
    // A live paid cycle is the normal lifecycle's; one already in grace keeps its clock.
    if (liveCycle || row.status === 'past_due') return false
  }

  const lifecycleProviders: string[] = [...PLATFORM_SELF_MANAGED_PROVIDERS, ...PLATFORM_APP_CANCELED_PROVIDERS]
  if (row) {
    const { error } = await supabase
      .from('platform_subscriptions')
      .update({
        plan_id: plan.plan_id,
        status: 'past_due',
        grace_period_end: graceEnd,
        current_period_end: nowIso,
        cancel_at_period_end: false,
        canceled_at: null,
        // The downgrade phase only visits lifecycle-owned rails; an override/canceled
        // row on another rail would otherwise sit in grace forever.
        ...(row.payment_provider && lifecycleProviders.includes(row.payment_provider) ? {} : { payment_provider: 'manual' }),
        updated_at: nowIso,
      })
      .eq('tenant_id', tenant.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('platform_subscriptions').insert({
      tenant_id: tenant.id,
      plan_id: plan.plan_id,
      status: 'past_due',
      payment_provider: 'manual',
      interval: 'monthly',
      current_period_start: nowIso,
      current_period_end: nowIso,
      grace_period_end: graceEnd,
    })
    if (error) throw new Error(error.message)
  }

  const { error: tenantError } = await supabase
    .from('tenants')
    .update({ billing_status: 'past_due', updated_at: nowIso })
    .eq('id', tenant.id)
  if (tenantError) throw new Error(tenantError.message)
  return true
}

export async function GET(req: NextRequest) {
  return Sentry.withMonitor('cron-comped-expiry', () => runSweep(req), {
    schedule: { type: 'crontab', value: '0 2 * * *' },
    checkinMargin: 120,
    maxRuntime: 20,
    timezone: 'Etc/UTC',
  })
}
