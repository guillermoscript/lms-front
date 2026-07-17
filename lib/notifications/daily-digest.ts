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

interface CandidateRow {
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

/** UTC yesterday as YYYY-MM-DD — matches award_xp()'s CURRENT_DATE streak math. */
export function utcYesterday(now: Date): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

/** Streak survives only if the student acts today: last activity was exactly yesterday. */
export function isStreakAtRisk(lastActivityDate: string | null, streak: number, now: Date, min: number): boolean {
  return streak >= min && lastActivityDate === utcYesterday(now)
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

  const { data: candidates, error: candErr } = await admin.rpc('get_daily_digest_candidates')
  if (candErr) {
    result.errors.push(`candidates query failed: ${candErr.message}`)
    return result
  }
  const rows = (candidates ?? []) as CandidateRow[]
  if (rows.length === 0) return result

  const byTenant = new Map<string, CandidateRow[]>()
  for (const row of rows) {
    const list = byTenant.get(row.tenant_id) ?? []
    list.push(row)
    byTenant.set(row.tenant_id, list)
  }
  const tenantIds = [...byTenant.keys()]
  result.tenantsConsidered = tenantIds.length

  const [{ data: tenants }, { data: settingRows }] = await Promise.all([
    admin.from('tenants').select('id, name, slug').in('id', tenantIds),
    admin.from('tenant_settings').select('tenant_id, setting_value').eq('setting_key', 'daily_digest').in('tenant_id', tenantIds),
  ])
  const tenantById = new Map((tenants ?? []).map((t) => [t.id as string, t as { id: string; name: string; slug: string | null }]))
  const settingsByTenant = new Map((settingRows ?? []).map((s) => [s.tenant_id as string, s.setting_value]))

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

    const userIds = allCandidates.map((c) => c.user_id)
    const { data: prefRows } = await admin
      .from('notification_preferences')
      .select('user_id, in_app_enabled, email_enabled, email_frequency')
      .in('user_id', userIds)
    const prefsByUser = new Map(((prefRows ?? []) as PreferencesRow[]).map((p) => [p.user_id, p]))

    for (const kind of kinds) {
      const recipients = allCandidates.filter((c) =>
        kind === 'daily_digest'
          ? c.due_cards > 0 ||
            c.goals_pending > 0 ||
            isStreakAtRisk(c.last_activity_date, c.current_streak, now, DIGEST_STREAK_MIN)
          : isStreakAtRisk(c.last_activity_date, c.current_streak, now, NUDGE_STREAK_MIN)
      )
      if (recipients.length === 0) continue

      // Idempotency: users already notified (this kind, this tenant-local day).
      const { data: sentRows, error: sentErr } = await admin
        .from('notifications')
        .select('target_user_ids')
        .eq('tenant_id', tenantId)
        .eq('metadata->>kind', kind)
        .eq('metadata->>date', dateStr)
      if (sentErr) {
        result.errors.push(`tenant ${tenantId} ${kind}: idempotency check failed: ${sentErr.message}`)
        continue
      }
      const alreadySent = new Set((sentRows ?? []).flatMap((r) => (r.target_user_ids ?? []) as string[]))

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
            kind === 'daily_digest' ? DIGEST_STREAK_MIN : NUDGE_STREAK_MIN
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
