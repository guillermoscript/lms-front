import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { paymentRequestReminderTemplate } from '@/lib/email/templates/payment-request-reminder'
import { getSchoolBrand } from '@/lib/themes/school-brand'
import { formatCurrency } from '@/lib/currency'
import { formatDateTime } from '@/lib/format-date-time'
import { getTenantTimeZone } from '@/lib/tenant-timezone'
import { tenantBaseUrl, resolveDigestSettings } from '@/lib/notifications/daily-digest'
import {
  EXPIRABLE_MANUAL_REQUEST_STATUSES,
  MANUAL_REQUEST_REMINDER_LEAD_DAYS,
  isManualRequestExpirable,
} from '@/lib/payments/manual-request-ttl'

export const runtime = 'nodejs'

/**
 * Cron job: remind and expire lapsed student-facing `payment_requests`
 * (issue #802).
 *
 * `lib/payments/manual-request-ttl.ts` owns the rules this route enforces —
 * every predicate below is imported, not re-derived, so this file and the
 * duplicate-request guard in `app/actions/payment-requests.ts` can never
 * disagree about which row is expirable.
 *
 * Two phases, run in order so a request that would be expired this tick is
 * never also reminded on the same pass:
 *   1. Remind  — an open, unreported request entering its last
 *      `MANUAL_REQUEST_REMINDER_LEAD_DAYS` days gets one email, then
 *      `reminder_sent_at` is stamped so it is never sent twice.
 *   2. Expire  — an unpaid request past `expires_at` is closed
 *      (`status: 'cancelled'`, `expired_at` stamped) with an in-app
 *      notification only, no email (see the comment on phase 2 below).
 *
 * Both phases are status-gated on write, so a re-run — or a student/admin
 * action landing mid-pass — is idempotent and never fights the row it is
 * racing against.
 *
 * Secured by CRON_SECRET. Scheduled from .github/workflows/cron.yml; operating
 * notes in docs/CRON_RUNBOOK.md.
 */

/** Cap one pass per phase so a backlog cannot time the request out; the next tick continues. */
const BATCH_LIMIT = 200
const DAY_MS = 24 * 60 * 60 * 1000

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

/** Resolve a human item name from a request row with product/plan embeds. */
type RequestWithItemEmbeds = {
  product?: { name?: string | null } | { name?: string | null }[] | null
  plan?: { plan_name?: string | null } | { plan_name?: string | null }[] | null
}
function itemNameFromRequest(request: RequestWithItemEmbeds | null): string {
  const product = Array.isArray(request?.product) ? request.product[0] : request?.product
  const plan = Array.isArray(request?.plan) ? request.plan[0] : request?.plan
  return product?.name || plan?.plan_name || 'your purchase'
}

/**
 * Best-effort per-tenant reading language. Nothing stores a per-student
 * locale, and a cron tick runs outside next-intl's request scope, so
 * `bestEffortLocaleOr()` (the pattern `app/actions/payment-requests.ts` uses)
 * would always resolve to its fallback here. `tenant_settings.daily_digest`
 * is the only per-tenant language signal that already exists — reused rather
 * than adding a second place a school sets its language.
 */
async function resolveTenantLocale(admin: SupabaseClient, tenantId: string): Promise<'en' | 'es'> {
  const { data } = await admin
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', 'daily_digest')
    .maybeSingle()
  return resolveDigestSettings(data?.setting_value).locale
}

/**
 * Best-effort in-app notification to the student that their payment request
 * expired. Mirrors the fan-out shape in `app/actions/payment-requests.ts`
 * (`notifyPaymentRequestStatus`): one tenant-scoped `notifications` row + one
 * `user_notifications` delivery row. Never throws — a failed notification
 * must not abort the sweep.
 */
async function notifyRequestExpired(params: {
  admin: SupabaseClient
  tenantId: string
  studentUserId: string
  itemName: string
}): Promise<void> {
  const { admin, tenantId, studentUserId, itemName } = params
  try {
    const { data: notification, error } = await admin
      .from('notifications')
      .insert({
        title: 'Payment request expired',
        content: `Your payment request for ${itemName} expired without a confirmed payment and has been closed. Start a new request if you still want it.`,
        notification_type: 'info',
        priority: 'normal',
        target_type: 'user',
        target_user_ids: [studentUserId],
        status: 'sent',
        sent_at: new Date().toISOString(),
        // No human actor — the sweep closed it.
        created_by: studentUserId,
        tenant_id: tenantId,
      })
      .select('id')
      .single()

    if (error || !notification) return

    await admin
      .from('user_notifications')
      .insert({ notification_id: notification.id, user_id: studentUserId })
  } catch (err) {
    console.error('[expire-payment-requests] failed to notify student of expiry', err)
  }
}

interface ReminderCandidate {
  request_id: number
  tenant_id: string
  user_id: string
  expires_at: string | null
  payment_amount: number | null
  payment_currency: string | null
  product?: { name?: string | null } | { name?: string | null }[] | null
  plan?: { plan_name?: string | null } | { plan_name?: string | null }[] | null
}

interface ExpireCandidate {
  request_id: number
  tenant_id: string
  user_id: string
  status: string
  expires_at: string | null
  payment_reported_at: string | null
  product?: { name?: string | null } | { name?: string | null }[] | null
  plan?: { plan_name?: string | null } | { plan_name?: string | null }[] | null
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const now = new Date()
  const nowIso = now.toISOString()
  // The reminder window is symmetric around a single constant, so one horizon
  // (now + lead days) covers every row — no per-row day math needed in SQL.
  const reminderHorizonIso = new Date(now.getTime() + MANUAL_REQUEST_REMINDER_LEAD_DAYS * DAY_MS).toISOString()

  const result = { reminded: 0, expired: 0, errors: [] as string[] }

  // ---- Phase 1: pre-expiry reminder ----
  // `EXPIRABLE_MANUAL_REQUEST_STATUSES` (pending, contacted) already excludes
  // `payment_received` — an admin-confirmed request needs no nudge, it needs
  // `completeAndEnroll`. `payment_reported_at IS NULL` excludes a request the
  // student already reported money against for the same reason phase 2 does
  // below: once a claim is on file, reminding "you haven't paid" is simply
  // wrong.
  const { data: reminderCandidates, error: reminderQueryError } = await admin
    .from('payment_requests')
    .select(
      'request_id, tenant_id, user_id, expires_at, payment_amount, payment_currency, product:products(name), plan:plans(plan_name)',
    )
    .in('status', EXPIRABLE_MANUAL_REQUEST_STATUSES as unknown as string[])
    .is('payment_reported_at', null)
    .is('reminder_sent_at', null)
    .not('expires_at', 'is', null)
    .gt('expires_at', nowIso)
    .lte('expires_at', reminderHorizonIso)
    .order('expires_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (reminderQueryError) {
    result.errors.push(`reminder query failed: ${reminderQueryError.message}`)
  }

  for (const row of (reminderCandidates as ReminderCandidate[] | null) || []) {
    try {
      const [{ data: authUser }, { data: tenant }, brand, timeZone, locale] = await Promise.all([
        admin.auth.admin.getUserById(row.user_id),
        admin.from('tenants').select('name, slug').eq('id', row.tenant_id).maybeSingle(),
        getSchoolBrand(row.tenant_id),
        getTenantTimeZone(row.tenant_id),
        resolveTenantLocale(admin, row.tenant_id),
      ])

      const to = authUser?.user?.email
      const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : now.getTime()
      const daysRemaining = Math.max(0, Math.ceil((expiresAtMs - now.getTime()) / DAY_MS))

      // A reachable address is the common case, not a guarantee — a deleted
      // auth user or a read that failed must not stop the stamp below, or a
      // permanently unreachable row would be re-queried and re-attempted on
      // every tick forever.
      if (to) {
        const template = paymentRequestReminderTemplate({
          schoolName: brand.name || tenant?.name || 'your school',
          itemName: itemNameFromRequest(row),
          amountLabel: formatCurrency(row.payment_amount ?? 0, row.payment_currency || 'usd'),
          deadlineLabel: formatDateTime(row.expires_at, { locale, timeZone }),
          daysRemaining,
          requestUrl: `${tenantBaseUrl(tenant?.slug ?? null)}/${locale}/dashboard/student/payments/${row.request_id}`,
          locale,
          brand,
        })
        await sendEmail({ to, ...template })
      }

      // Stamped whether or not the email actually went out (no mailer
      // configured, no address on file, Mailgun down). Reminders are a
      // courtesy, not the mechanism that protects the student — that is the
      // TTL asymmetry in `isManualRequestOpen()`. Retrying the send every tick
      // until it succeeds would burn a request against every provider on a row
      // that may never become reachable, which is worse than one missed email.
      const { error: stampError } = await admin
        .from('payment_requests')
        .update({ reminder_sent_at: nowIso, updated_at: nowIso })
        .eq('request_id', row.request_id)
        .eq('tenant_id', row.tenant_id)
        // Status-gated so a student who paid (and reported it) between the
        // SELECT and this UPDATE does not get a stale "reminder sent" stamp
        // racing their own report.
        .is('reminder_sent_at', null)
        .is('payment_reported_at', null)

      if (stampError) {
        result.errors.push(`reminder stamp failed for request ${row.request_id}: ${stampError.message}`)
        continue
      }
      result.reminded++
    } catch (err) {
      console.error('[expire-payment-requests] reminder failed for request', row.request_id, err)
      result.errors.push(`reminder failed for request ${row.request_id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ---- Phase 2: expire lapsed requests ----
  // The SQL filter below only narrows to CANDIDATES — the actual gate is
  // `isManualRequestExpirable()`, imported from the TTL rules module, so this
  // route can never drift from the duplicate-request guard in
  // `app/actions/payment-requests.ts` about which row is fair game.
  const { data: expireCandidates, error: expireQueryError } = await admin
    .from('payment_requests')
    .select(
      'request_id, tenant_id, user_id, status, expires_at, payment_reported_at, product:products(name), plan:plans(plan_name)',
    )
    .in('status', EXPIRABLE_MANUAL_REQUEST_STATUSES as unknown as string[])
    .is('payment_reported_at', null)
    .not('expires_at', 'is', null)
    .lte('expires_at', nowIso)
    .order('expires_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (expireQueryError) {
    result.errors.push(`expire query failed: ${expireQueryError.message}`)
  }

  for (const row of (expireCandidates as ExpireCandidate[] | null) || []) {
    if (!isManualRequestExpirable(row, now)) continue

    try {
      // `admin_notes` is deliberately left untouched — it is the admin's own
      // record, and the sweep closing the row is not the admin saying
      // anything.
      const { data: closed, error } = await admin
        .from('payment_requests')
        .update({ status: 'cancelled', expired_at: nowIso, updated_at: nowIso })
        .eq('request_id', row.request_id)
        .eq('tenant_id', row.tenant_id)
        // Status-gated so an admin confirming receipt (→ payment_received) or
        // the student reporting a payment (→ payment_reported_at set) in the
        // same instant wins the race, not the sweep.
        .in('status', EXPIRABLE_MANUAL_REQUEST_STATUSES as unknown as string[])
        .is('payment_reported_at', null)
        .select('request_id')
        .maybeSingle()

      if (error) {
        result.errors.push(`expire failed for request ${row.request_id}: ${error.message}`)
        continue
      }
      if (!closed) continue

      // In-app notification only — deliberately no email. The migration
      // backfilled `expires_at` from `created_at` for every pre-existing row,
      // so the first production pass closes a backlog of requests that may be
      // months old in one tick. Emailing that backlog would tell students
      // "your payment request expired" about something they forgot long ago —
      // worse than silence. New requests can't hit this backlog blind: phase 1
      // above only reminds a row whose `expires_at` is still in the future, so
      // every request that gets a reminder also gets a chance to see this
      // notification land while it is still fresh.
      await notifyRequestExpired({
        admin,
        tenantId: row.tenant_id,
        studentUserId: row.user_id,
        itemName: itemNameFromRequest(row),
      })
      result.expired++
    } catch (err) {
      console.error('[expire-payment-requests] expire failed for request', row.request_id, err)
      result.errors.push(`expire failed for request ${row.request_id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json(result)
}
