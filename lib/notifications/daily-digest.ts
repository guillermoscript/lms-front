/**
 * Daily review-due digest + streak-at-risk nudge (issue #397).
 *
 * Called hourly by the cron route with a service-role client. For each tenant
 * whose local hour matches its configured send hour we send one personalized
 * "your day at <school>" notification per student with something to say (due
 * review cards, incomplete study goals this week, streak at risk); at the
 * nudge hour we send an optional second streak-saver to students with a
 * streak >= 7 and still no activity today. Structural cap: max 2 sends/day.
 *
 * The service role bypasses RLS — every query and insert here carries
 * tenant_id explicitly; that hygiene is load-bearing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { dailyDigestEmailTemplate, streakNudgeEmailTemplate } from '@/lib/email/templates/daily-digest'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'

export type DigestLocale = 'en' | 'es'
export type DigestKind = 'daily_digest' | 'streak_nudge'

export interface DigestSettings {
  sendHour: number
  nudgeHour: number
  timezone: string
  locale: DigestLocale
}

export const DEFAULT_DIGEST_SETTINGS: DigestSettings = {
  sendHour: 17,
  nudgeHour: 20,
  timezone: 'UTC',
  locale: 'en',
}

/** Minimum streak worth mentioning as "ends tonight" in the digest. */
export const DIGEST_STREAK_MIN = 3
/** Minimum streak that earns the evening nudge (the Duolingo mechanic). */
export const NUDGE_STREAK_MIN = 7

export interface CandidateRow {
  tenant_id: string
  user_id: string
  email: string | null
  full_name: string | null
  due_cards: number
  goals_pending: number
  current_streak: number
  last_activity_date: string | null
}

interface PreferencesRow {
  user_id: string
  in_app_enabled: boolean
  email_enabled: boolean
  email_frequency: string
}

export interface DigestRunResult {
  tenantsConsidered: number
  tenantsProcessed: number
  digestsSent: number
  nudgesSent: number
  emailsSent: number
  skippedAlreadySent: number
  errors: string[]
}

/** Parse a tenant_settings `daily_digest` JSONB value, falling back per-field. */
export function resolveDigestSettings(value: unknown): DigestSettings {
  const v = (value ?? {}) as Record<string, unknown>
  const int = (x: unknown): number | null => {
    const n = typeof x === 'string' ? parseInt(x, 10) : typeof x === 'number' ? x : NaN
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null
  }
  return {
    sendHour: int(v.send_hour) ?? DEFAULT_DIGEST_SETTINGS.sendHour,
    nudgeHour: int(v.nudge_hour) ?? DEFAULT_DIGEST_SETTINGS.nudgeHour,
    timezone: typeof v.timezone === 'string' && v.timezone ? v.timezone : DEFAULT_DIGEST_SETTINGS.timezone,
    locale: v.locale === 'es' ? 'es' : DEFAULT_DIGEST_SETTINGS.locale,
  }
}

/** Hour of day (0-23) in the given IANA timezone; invalid tz falls back to UTC. */
export function localHour(now: Date, timezone: string): number {
  try {
    return parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(now),
      10
    )
  } catch {
    return now.getUTCHours()
  }
}

/** YYYY-MM-DD in the given IANA timezone; invalid tz falls back to UTC. */
export function localDateStr(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/**
 * YYYY-MM-DD for the day before `now` in the given IANA timezone.
 *
 * Takes the local calendar date first, then steps back one calendar day on that
 * date alone. Subtracting 24h from the instant would land on the wrong date
 * across a DST transition.
 */
export function localYesterday(now: Date, timezone: string): string {
  const [y, m, d] = localDateStr(now, timezone).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

/**
 * Streak survives only if the student acts today: last activity was exactly
 * yesterday *in the tenant's timezone*.
 *
 * This compared against UTC yesterday until issue #549. Everything else about
 * the send is tenant-local — `localHour` decides whether to send at all, and
 * `localDateStr` keys idempotency — so at UTC-5 (Bogotá, Lima) the 20:00 nudge
 * runs at 01:00 UTC the *next* UTC day, and a student who practised that same
 * local afternoon was told their streak was ending hours after they had secured
 * it, while the students who actually skipped the local day were silently
 * skipped. It misfired whenever `nudgeHour + |utc_offset| >= 24`.
 *
 * Known residual: `last_activity_date` is still written by award_xp() from
 * CURRENT_DATE, i.e. the UTC day, so a student whose only activity fell in the
 * local evening after the UTC day rolled over is still measured against the
 * wrong day. Fixing that means changing award_xp()'s day boundary, which would
 * shift every existing streak — a deliberate migration, not a side effect of
 * this one (issue #549 §3).
 */
export function isStreakAtRisk(
  lastActivityDate: string | null,
  streak: number,
  now: Date,
  min: number,
  timezone: string
): boolean {
  return streak >= min && lastActivityDate === localYesterday(now, timezone)
}

const SUMMARY_COPY = {
  en: {
    cards: (n: number) => `${n} ${n === 1 ? 'card' : 'cards'} due`,
    goals: (n: number) => `${n} ${n === 1 ? 'study goal' : 'study goals'} left this week`,
    streak: (n: number) => `your ${n}-day streak ends tonight`,
  },
  es: {
    cards: (n: number) => `${n} ${n === 1 ? 'tarjeta pendiente' : 'tarjetas pendientes'}`,
    goals: (n: number) => `${n} ${n === 1 ? 'meta de estudio' : 'metas de estudio'} esta semana`,
    streak: (n: number) => `tu racha de ${n} días termina esta noche`,
  },
} as const

/** "12 cards due · 1 study goal left this week · your 14-day streak ends tonight" */
export function buildSummary(
  parts: { dueCards: number; goalsPending: number; streak: number; streakAtRisk: boolean },
  locale: DigestLocale
): string {
  const copy = SUMMARY_COPY[locale]
  const out: string[] = []
  if (parts.dueCards > 0) out.push(copy.cards(parts.dueCards))
  if (parts.goalsPending > 0) out.push(copy.goals(parts.goalsPending))
  if (parts.streakAtRisk && parts.streak >= DIGEST_STREAK_MIN) out.push(copy.streak(parts.streak))
  return out.join(' · ')
}

/** Same {{var}} interpolation as app/actions/admin/notification-templates.ts. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return rendered
}

/** Missing preferences row = schema defaults (in-app on, email on, immediate). */
export function resolveChannels(row: PreferencesRow | undefined): { inApp: boolean; email: boolean } {
  if (!row) return { inApp: true, email: true }
  return {
    inApp: row.in_app_enabled,
    email: row.email_enabled && row.email_frequency !== 'never',
  }
}

export function firstName(fullName: string | null, locale: DigestLocale): string {
  const first = fullName?.trim().split(/\s+/)[0]
  return first || (locale === 'es' ? 'estudiante' : 'there')
}

/** https://{slug}.{platform-domain} — same heuristic as the invitation email. */
export function tenantBaseUrl(slug: string | null): string {
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  const protocol = platformDomain.includes('localhost') || platformDomain.includes('lvh.me') ? 'http' : 'https'
  return `${protocol}://${slug || 'app'}.${platformDomain}`
}

const FALLBACK_TEMPLATES: Record<DigestKind, Record<DigestLocale, { title: string; content: string }>> = {
  daily_digest: {
    en: { title: 'Your day at {{school_name}}', content: '{{summary}}. A few minutes today keeps you on track.' },
    es: { title: 'Tu día en {{school_name}}', content: '{{summary}}. Unos minutos hoy te mantienen al día.' },
  },
  streak_nudge: {
    en: {
      title: 'Your {{streak}}-day streak ends tonight',
      content: '{{first_name}}, one quick practice session before the day ends keeps your {{streak}}-day streak alive.',
    },
    es: {
      title: 'Tu racha de {{streak}} días termina esta noche',
      content: '{{first_name}}, una sesión rápida de práctica antes de que termine el día mantiene viva tu racha de {{streak}} días.',
    },
  },
}

interface TemplateRow {
  id: number
  name: string
  title: string
  content: string
  tenant_id: string | null
}

/** Prefer a tenant-specific template row over the global seed, else fallback copy. */
export function pickTemplate(
  rows: TemplateRow[],
  kind: DigestKind,
  locale: DigestLocale,
  tenantId: string
): { id: number | null; title: string; content: string } {
  const name = `${kind}_${locale}`
  const candidates = rows.filter((r) => r.name === name)
  const row = candidates.find((r) => r.tenant_id === tenantId) ?? candidates.find((r) => r.tenant_id === null)
  if (row) return { id: row.id, title: row.title, content: row.content }
  const fb = FALLBACK_TEMPLATES[kind][locale]
  return { id: null, title: fb.title, content: fb.content }
}

/**
 * Candidates requested per RPC call. Below the 1000 row cap so a page is never
 * clamped in the common case — but nothing here depends on that, see below.
 */
export const DIGEST_CANDIDATE_PAGE_SIZE = 500

/** Runaway guard, mirroring `fetchAllRows`'s. Covers 1,000,000 candidates. */
const MAX_CANDIDATE_PAGES = 2000

/**
 * Read every digest candidate, across every tenant (#548).
 *
 * `get_daily_digest_candidates` is a SETOF function, so PostgREST caps its
 * result exactly as it caps a table read and hands back the truncated set as a
 * plain 200. Before the function was ordered and given a cursor, one
 * unparameterised call past 1000 candidates meant the cron processed an
 * arbitrary subset — a different one each run — and no student, admin or log
 * line could tell.
 *
 * The stop condition is an EMPTY page, never a short one. A page shorter than
 * `pageSize` is ambiguous: it is the end of the set, or it is the server's row
 * cap clamping us below what we asked for. Reading "short" as "done" is the
 * original bug in a new place. Termination is instead guaranteed by the
 * cursor, which advances strictly on every non-empty page.
 *
 * @throws if a page errors or the set outlasts `MAX_CANDIDATE_PAGES`.
 */
export async function fetchDigestCandidates(
  admin: SupabaseClient,
  pageSize: number = DIGEST_CANDIDATE_PAGE_SIZE
): Promise<CandidateRow[]> {
  const rows: CandidateRow[] = []
  let afterTenantId: string | null = null
  let afterUserId: string | null = null

  for (let page = 0; page < MAX_CANDIDATE_PAGES; page++) {
    const { data, error } = await admin.rpc('get_daily_digest_candidates', {
      _after_tenant_id: afterTenantId,
      _after_user_id: afterUserId,
      _limit: pageSize,
    })
    if (error) throw new Error(error.message)

    const batch = (data ?? []) as CandidateRow[]
    if (batch.length === 0) return rows
    rows.push(...batch)

    const last = batch[batch.length - 1]
    afterTenantId = last.tenant_id
    afterUserId = last.user_id
  }

  throw new Error(
    `get_daily_digest_candidates: still returning rows after ${MAX_CANDIDATE_PAGES} pages ` +
      `(${rows.length} candidates); refusing to loop further.`
  )
}

/**
 * Run one hourly tick. Idempotent per (user, kind, tenant-local day): re-runs
 * and cron retries within the same day never double-send.
 */
export async function runDailyDigest(admin: SupabaseClient, now: Date = new Date()): Promise<DigestRunResult> {
  const result: DigestRunResult = {
    tenantsConsidered: 0,
    tenantsProcessed: 0,
    digestsSent: 0,
    nudgesSent: 0,
    emailsSent: 0,
    skippedAlreadySent: 0,
    errors: [],
  }

  let rows: CandidateRow[]
  try {
    rows = await fetchDigestCandidates(admin)
  } catch (err) {
    result.errors.push(`candidates query failed: ${err instanceof Error ? err.message : String(err)}`)
    return result
  }
  if (rows.length === 0) return result

  const byTenant = new Map<string, CandidateRow[]>()
  for (const row of rows) {
    const list = byTenant.get(row.tenant_id) ?? []
    list.push(row)
    byTenant.set(row.tenant_id, list)
  }
  const tenantIds = [...byTenant.keys()]
  result.tenantsConsidered = tenantIds.length

  // Chunked and paged (#548). `tenantIds` is as long as the candidate set is
  // wide, so both the `.in()` URL and the response can overflow. A tenant
  // missing from either read is skipped below (`if (!tenant) continue`) — that
  // is correct for a tenant that genuinely does not exist and silently wrong
  // for one the read merely dropped, so this must be complete or fail loudly.
  let tenants: Array<{ id: string; name: string; slug: string | null }>
  let settingRows: Array<{ tenant_id: string; setting_value: unknown }>
  try {
    ;[tenants, settingRows] = await Promise.all([
      fetchAllRowsIn<{ id: string; name: string; slug: string | null }, string>(
        'tenants',
        tenantIds,
        (chunk, from, to) =>
          admin.from('tenants').select('id, name, slug', { count: 'exact' }).in('id', chunk).order('id').range(from, to)
      ),
      fetchAllRowsIn<{ tenant_id: string; setting_value: unknown }, string>(
        'tenant_settings',
        tenantIds,
        (chunk, from, to) =>
          admin
            .from('tenant_settings')
            .select('tenant_id, setting_value', { count: 'exact' })
            .eq('setting_key', 'daily_digest')
            .in('tenant_id', chunk)
            .order('id')
            .range(from, to)
      ),
    ])
  } catch (err) {
    result.errors.push(`tenant lookup failed: ${err instanceof Error ? err.message : String(err)}`)
    return result
  }
  const tenantById = new Map(tenants.map((t) => [t.id, t]))
  const settingsByTenant = new Map(settingRows.map((s) => [s.tenant_id, s.setting_value]))

  for (const tenantId of tenantIds) {
    const tenant = tenantById.get(tenantId)
    if (!tenant) continue
    const settings = resolveDigestSettings(settingsByTenant.get(tenantId))
    const hour = localHour(now, settings.timezone)

    // Digest first; nudge second. If send_hour === nudge_hour both run in the
    // same tick, still capped at 2 sends/day by construction.
    const kinds: DigestKind[] = []
    if (hour === settings.sendHour) kinds.push('daily_digest')
    if (hour === settings.nudgeHour) kinds.push('streak_nudge')
    if (kinds.length === 0) continue
    result.tenantsProcessed++

    const allCandidates = byTenant.get(tenantId) ?? []
    const dateStr = localDateStr(now, settings.timezone)
    const schoolName = tenant.name
    const actionUrl = `${tenantBaseUrl(tenant.slug)}/${settings.locale}/dashboard/student?src=digest`

    const { data: templateRows } = await admin
      .from('notification_templates')
      .select('id, name, title, content, tenant_id')
      .in('name', [`daily_digest_${settings.locale}`, `streak_nudge_${settings.locale}`])
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)

    // Chunked and paged (#548), and — unlike before — a failure here aborts the
    // tenant instead of falling through with an empty map.
    //
    // This is the read whose truncation is not a wrong number but wrong
    // behaviour: `resolveChannels(undefined)` treats a missing row as the
    // schema default `{ inApp: true, email: true }`, so every student the read
    // dropped gets emailed — including the ones who went and turned email off.
    // "Read fewer preferences" must never be able to mean "send more email".
    const userIds = allCandidates.map((c) => c.user_id)
    let prefRows: PreferencesRow[]
    try {
      prefRows = await fetchAllRowsIn<PreferencesRow, string>(
        'notification_preferences',
        userIds,
        (chunk, from, to) =>
          admin
            .from('notification_preferences')
            .select('user_id, in_app_enabled, email_enabled, email_frequency', { count: 'exact' })
            .in('user_id', chunk)
            .order('id')
            .range(from, to)
      )
    } catch (err) {
      result.errors.push(
        `tenant ${tenantId}: preferences read failed, skipping tenant rather than risk emailing opted-out students: ` +
          `${err instanceof Error ? err.message : String(err)}`
      )
      continue
    }
    const prefsByUser = new Map(prefRows.map((p) => [p.user_id, p]))

    for (const kind of kinds) {
      const recipients = allCandidates.filter((c) =>
        kind === 'daily_digest'
          ? c.due_cards > 0 ||
            c.goals_pending > 0 ||
            isStreakAtRisk(c.last_activity_date, c.current_streak, now, DIGEST_STREAK_MIN, settings.timezone)
          : isStreakAtRisk(c.last_activity_date, c.current_streak, now, NUDGE_STREAK_MIN, settings.timezone)
      )
      if (recipients.length === 0) continue

      // Idempotency: users already notified (this kind, this tenant-local day).
      //
      // Paged and count-verified (#548). One notification row is written per
      // recipient, so this read is the same size as yesterday's send — in a
      // tenant past the row cap it truncated, and every recipient missing from
      // `alreadySent` was sent to again. That turns the module's documented
      // "re-runs and cron retries never double-send" guarantee into its
      // opposite precisely when a retry happens. Ordered by primary key.
      let sentRows: Array<{ target_user_ids: string[] | null }>
      try {
        sentRows = await fetchAllRows<{ target_user_ids: string[] | null }>('notifications', (from, to) =>
          admin
            .from('notifications')
            .select('target_user_ids', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('metadata->>kind', kind)
            .eq('metadata->>date', dateStr)
            .order('id')
            .range(from, to)
        )
      } catch (err) {
        result.errors.push(
          `tenant ${tenantId} ${kind}: idempotency check failed: ${err instanceof Error ? err.message : String(err)}`
        )
        continue
      }
      const alreadySent = new Set(sentRows.flatMap((r) => r.target_user_ids ?? []))

      for (const candidate of recipients) {
        if (alreadySent.has(candidate.user_id)) {
          result.skippedAlreadySent++
          continue
        }
        try {
          const channels = resolveChannels(prefsByUser.get(candidate.user_id))
          if (!channels.inApp && !channels.email) continue

          const streakAtRisk = isStreakAtRisk(
            candidate.last_activity_date,
            candidate.current_streak,
            now,
            kind === 'daily_digest' ? DIGEST_STREAK_MIN : NUDGE_STREAK_MIN,
            settings.timezone
          )
          const summary = buildSummary(
            {
              dueCards: candidate.due_cards,
              goalsPending: candidate.goals_pending,
              streak: candidate.current_streak,
              streakAtRisk,
            },
            settings.locale
          )
          const vars: Record<string, string> = {
            school_name: schoolName,
            summary,
            streak: String(candidate.current_streak),
            first_name: firstName(candidate.full_name, settings.locale),
          }
          const template = pickTemplate((templateRows ?? []) as TemplateRow[], kind, settings.locale, tenantId)
          const title = renderTemplate(template.title, vars)
          const content = renderTemplate(template.content, vars)

          const deliveryChannels = [...(channels.inApp ? ['in_app'] : []), ...(channels.email ? ['email'] : [])]
          const { data: notification, error: insertErr } = await admin
            .from('notifications')
            .insert({
              tenant_id: tenantId,
              title,
              content,
              notification_type: 'info',
              priority: 'normal',
              target_type: 'user',
              target_user_ids: [candidate.user_id],
              delivery_channels: deliveryChannels,
              status: 'sent',
              sent_at: now.toISOString(),
              template_id: template.id,
              metadata: {
                kind,
                date: dateStr,
                src: 'digest',
                action_url: actionUrl,
                due_cards: candidate.due_cards,
                goals_pending: candidate.goals_pending,
                streak: candidate.current_streak,
              },
            })
            .select('id')
            .single()
          if (insertErr || !notification) {
            result.errors.push(`tenant ${tenantId} ${kind} user ${candidate.user_id}: insert failed: ${insertErr?.message}`)
            continue
          }

          let emailSent = false
          if (channels.email && candidate.email) {
            const emailTemplate =
              kind === 'daily_digest'
                ? dailyDigestEmailTemplate(
                    {
                      schoolName,
                      firstName: vars.first_name,
                      summary,
                      dueCards: candidate.due_cards,
                      goalsPending: candidate.goals_pending,
                      streak: streakAtRisk ? candidate.current_streak : 0,
                      actionUrl,
                    },
                    settings.locale
                  )
                : streakNudgeEmailTemplate(
                    { schoolName, firstName: vars.first_name, streak: candidate.current_streak, actionUrl },
                    settings.locale
                  )
            emailSent = await sendEmail({ to: candidate.email, ...emailTemplate })
            if (emailSent) result.emailsSent++
          }

          const { error: userNotifErr } = await admin.from('user_notifications').insert({
            notification_id: notification.id,
            user_id: candidate.user_id,
            email_sent: emailSent,
            email_sent_at: emailSent ? now.toISOString() : null,
          })
          if (userNotifErr) {
            result.errors.push(
              `tenant ${tenantId} ${kind} user ${candidate.user_id}: user_notifications insert failed: ${userNotifErr.message}`
            )
            continue
          }

          if (kind === 'daily_digest') result.digestsSent++
          else result.nudgesSent++
        } catch (err) {
          result.errors.push(
            `tenant ${tenantId} ${kind} user ${candidate.user_id}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }
  }

  return result
}
