import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSummary,
  DEFAULT_DIGEST_SETTINGS,
  firstName,
  isStreakAtRisk,
  localDateStr,
  localHour,
  localYesterday,
  pickTemplate,
  renderTemplate,
  resolveChannels,
  resolveDigestSettings,
  tenantBaseUrl,
} from '@/lib/notifications/daily-digest'

/**
 * Pure helpers for the daily review-due digest + streak-at-risk nudge
 * (issue #397). `runDailyDigest` itself needs a Supabase client and is
 * intentionally out of scope here.
 */

describe('resolveDigestSettings', () => {
  it('returns defaults for undefined', () => {
    expect(resolveDigestSettings(undefined)).toEqual(DEFAULT_DIGEST_SETTINGS)
  })

  it('returns defaults for an empty object', () => {
    expect(resolveDigestSettings({})).toEqual(DEFAULT_DIGEST_SETTINGS)
  })

  it('accepts a fully valid settings object', () => {
    expect(
      resolveDigestSettings({ send_hour: 8, nudge_hour: 21, timezone: 'America/Bogota', locale: 'es' })
    ).toEqual({ sendHour: 8, nudgeHour: 21, timezone: 'America/Bogota', locale: 'es' })
  })

  it('rejects an out-of-range send_hour (25) and falls back to default', () => {
    expect(resolveDigestSettings({ send_hour: 25 }).sendHour).toBe(DEFAULT_DIGEST_SETTINGS.sendHour)
  })

  it('rejects a negative send_hour (-1) and falls back to default', () => {
    expect(resolveDigestSettings({ send_hour: -1 }).sendHour).toBe(DEFAULT_DIGEST_SETTINGS.sendHour)
  })

  it('rejects a non-numeric send_hour ("x") and falls back to default', () => {
    expect(resolveDigestSettings({ send_hour: 'x' }).sendHour).toBe(DEFAULT_DIGEST_SETTINGS.sendHour)
  })

  it('rejects an out-of-range nudge_hour the same way', () => {
    expect(resolveDigestSettings({ nudge_hour: 24 }).nudgeHour).toBe(DEFAULT_DIGEST_SETTINGS.nudgeHour)
  })

  it('maps any locale other than "es" to "en"', () => {
    expect(resolveDigestSettings({ locale: 'fr' }).locale).toBe('en')
    expect(resolveDigestSettings({ locale: 123 }).locale).toBe('en')
    expect(resolveDigestSettings({ locale: 'es' }).locale).toBe('es')
  })
})

describe('localHour', () => {
  it('computes the hour in America/Bogota (UTC-5)', () => {
    expect(localHour(new Date('2026-07-14T20:30:00Z'), 'America/Bogota')).toBe(15)
  })

  it('computes the hour in UTC', () => {
    expect(localHour(new Date('2026-07-14T20:30:00Z'), 'UTC')).toBe(20)
  })

  it('returns 0 (not 24) at local midnight', () => {
    expect(localHour(new Date('2026-07-14T00:10:00Z'), 'UTC')).toBe(0)
  })

  it('falls back to UTC hour for an invalid timezone', () => {
    const now = new Date('2026-07-14T20:30:00Z')
    expect(localHour(now, 'Not/AZone')).toBe(now.getUTCHours())
  })
})

describe('localDateStr', () => {
  it('returns YYYY-MM-DD in America/Bogota, rolling back a day near UTC midnight', () => {
    expect(localDateStr(new Date('2026-07-15T02:00:00Z'), 'America/Bogota')).toBe('2026-07-14')
  })

  it('returns YYYY-MM-DD in UTC', () => {
    expect(localDateStr(new Date('2026-07-14T12:00:00Z'), 'UTC')).toBe('2026-07-14')
  })

  it('falls back to UTC date for an invalid timezone', () => {
    const now = new Date('2026-07-14T12:00:00Z')
    expect(localDateStr(now, 'Not/AZone')).toBe(now.toISOString().slice(0, 10))
  })
})

describe('localYesterday + isStreakAtRisk (UTC baseline)', () => {
  // These cases predate #549 and were originally written against UTC via the
  // removed `utcYesterday`. Passing 'UTC' as the 5th arg to isStreakAtRisk
  // preserves their exact original intent.
  const now = new Date('2026-07-14T12:00:00Z')

  it('true when last_activity_date is UTC yesterday and streak >= min', () => {
    expect(isStreakAtRisk('2026-07-13', 7, now, 7, 'UTC')).toBe(true)
  })

  it('false when last_activity_date is today', () => {
    expect(isStreakAtRisk('2026-07-14', 7, now, 7, 'UTC')).toBe(false)
  })

  it('false when last_activity_date is two days ago', () => {
    expect(isStreakAtRisk('2026-07-12', 7, now, 7, 'UTC')).toBe(false)
  })

  it('false when streak is below min even if the date matches', () => {
    expect(isStreakAtRisk('2026-07-13', 2, now, 7, 'UTC')).toBe(false)
  })

  it('false when last_activity_date is null', () => {
    expect(isStreakAtRisk(null, 7, now, 7, 'UTC')).toBe(false)
  })

  it('localYesterday(now, "UTC") returns YYYY-MM-DD 24h before now', () => {
    expect(localYesterday(now, 'UTC')).toBe('2026-07-13')
  })
})

describe('LATAM regression (issue #549 §3): nudge fires past UTC midnight', () => {
  // Bogota is UTC-5 with no DST. A 20:00-local nudge (nudgeHour = 20) fires at
  // 01:00 UTC on the *next* UTC calendar day. Before #549, isStreakAtRisk
  // compared last_activity_date against UTC-yesterday (via the removed
  // utcYesterday), which is off by one day for any tenant west of UTC once
  // nudgeHour + |utc_offset| >= 24 — exactly this case (20 + 5 = 25).
  //
  // now = 2026-03-11T01:00:00Z == 2026-03-10 20:00 in America/Bogota.
  const now = new Date('2026-03-11T01:00:00Z')

  it('a student who practised the same Bogota-local day (2026-03-10) is NOT at risk', () => {
    // Under the old UTC-yesterday comparison this returned true: UTC-yesterday
    // of 2026-03-11T01:00:00Z is 2026-03-10, which incorrectly matched
    // last_activity_date and told the student their streak was ending hours
    // after they had already secured it.
    expect(isStreakAtRisk('2026-03-10', 10, now, 7, 'America/Bogota')).toBe(false)
  })

  it('a student who skipped the Bogota-local day (last active 2026-03-09) IS at risk', () => {
    // Under the old UTC-yesterday comparison this returned false: '2026-03-09'
    // never matched UTC-yesterday ('2026-03-10'), so the student who actually
    // needed the nudge — the one who skipped the local day — was silently
    // skipped.
    expect(isStreakAtRisk('2026-03-09', 10, now, 7, 'America/Bogota')).toBe(true)
  })

  it('demonstrates the exact off-by-one-day: Bogota-yesterday vs UTC-yesterday diverge at this instant', () => {
    expect(localYesterday(now, 'America/Bogota')).toBe('2026-03-09')
    expect(localYesterday(now, 'UTC')).toBe('2026-03-10')
  })
})

describe('localYesterday DST correctness', () => {
  // localYesterday deliberately takes the local calendar date first and steps
  // back one calendar day on that date alone, rather than subtracting 24h
  // from the instant and re-projecting into the timezone. The latter is wrong
  // near a DST transition.
  //
  // US spring-forward 2026: America/New_York jumps from 2:00 EST to 3:00 EDT
  // at 2026-03-08T07:00:00Z (clocks skip 2:00-3:00 local).
  //
  // now = 2026-03-09T04:30:00Z == 2026-03-09 00:30 EDT (UTC-4, post-transition).
  // The correct "yesterday" is the calendar date 2026-03-08.
  //
  // A naive now-minus-24h approach would compute 2026-03-08T04:30:00Z, which
  // is BEFORE that day's 07:00Z transition and therefore still EST (UTC-5):
  // 04:30 - 5h = 2026-03-07T23:30 local, i.e. it would wrongly land on
  // 2026-03-07 — one calendar day too far back, because the 24h subtraction
  // silently ate the extra hour DST added back on March 9.
  it('returns the correct previous calendar date across a spring-forward transition', () => {
    const now = new Date('2026-03-09T04:30:00Z')
    expect(localYesterday(now, 'America/New_York')).toBe('2026-03-08')
  })
})

describe('buildSummary', () => {
  it('en: singular card and singular goal, no streak line (not at risk)', () => {
    const out = buildSummary({ dueCards: 1, goalsPending: 1, streak: 5, streakAtRisk: false }, 'en')
    expect(out).toBe('1 card due · 1 study goal left this week')
  })

  it('en: plural cards and goals', () => {
    const out = buildSummary({ dueCards: 3, goalsPending: 2, streak: 0, streakAtRisk: false }, 'en')
    expect(out).toBe('3 cards due · 2 study goals left this week')
  })

  it('en: includes streak line when streakAtRisk and streak >= 3', () => {
    const out = buildSummary({ dueCards: 12, goalsPending: 1, streak: 14, streakAtRisk: true }, 'en')
    expect(out).toBe('12 cards due · 1 study goal left this week · your 14-day streak ends tonight')
  })

  it('en: omits streak line when streakAtRisk but streak < 3', () => {
    const out = buildSummary({ dueCards: 1, goalsPending: 0, streak: 2, streakAtRisk: true }, 'en')
    expect(out).toBe('1 card due')
  })

  it('en: omits streak line when streak >= 3 but not at risk', () => {
    const out = buildSummary({ dueCards: 1, goalsPending: 0, streak: 5, streakAtRisk: false }, 'en')
    expect(out).toBe('1 card due')
  })

  it('es: singular tarjeta/meta', () => {
    const out = buildSummary({ dueCards: 1, goalsPending: 1, streak: 5, streakAtRisk: false }, 'es')
    expect(out).toBe('1 tarjeta pendiente · 1 meta de estudio esta semana')
  })

  it('es: plural tarjetas/metas + streak line', () => {
    const out = buildSummary({ dueCards: 4, goalsPending: 3, streak: 9, streakAtRisk: true }, 'es')
    expect(out).toBe('4 tarjetas pendientes · 3 metas de estudio esta semana · tu racha de 9 días termina esta noche')
  })

  it('joins parts with " · "', () => {
    const out = buildSummary({ dueCards: 2, goalsPending: 1, streak: 3, streakAtRisk: true }, 'en')
    expect(out.split(' · ')).toHaveLength(3)
  })

  it('returns an empty string when everything is zero / not at risk', () => {
    expect(buildSummary({ dueCards: 0, goalsPending: 0, streak: 0, streakAtRisk: false }, 'en')).toBe('')
  })
})

describe('renderTemplate', () => {
  it('replaces a {{var}} placeholder', () => {
    expect(renderTemplate('Hi {{first_name}}!', { first_name: 'Ada' })).toBe('Hi Ada!')
  })

  it('replaces a repeated variable in all occurrences', () => {
    expect(renderTemplate('{{streak}} day streak, {{streak}} strong', { streak: '7' })).toBe(
      '7 day streak, 7 strong'
    )
  })

  it('replaces multiple distinct variables', () => {
    expect(renderTemplate('{{a}} and {{b}}', { a: '1', b: '2' })).toBe('1 and 2')
  })

  it('leaves a missing variable placeholder as-is', () => {
    expect(renderTemplate('Hi {{first_name}}, {{unknown}} remains', { first_name: 'Ada' })).toBe(
      'Hi Ada, {{unknown}} remains'
    )
  })
})

describe('resolveChannels', () => {
  it('undefined row defaults to both channels on', () => {
    expect(resolveChannels(undefined)).toEqual({ inApp: true, email: true })
  })

  it('email_enabled false turns email off', () => {
    expect(
      resolveChannels({ user_id: 'u1', in_app_enabled: true, email_enabled: false, email_frequency: 'immediate' })
    ).toEqual({ inApp: true, email: false })
  })

  it('email_frequency "never" turns email off even if email_enabled is true', () => {
    expect(
      resolveChannels({ user_id: 'u1', in_app_enabled: true, email_enabled: true, email_frequency: 'never' })
    ).toEqual({ inApp: true, email: false })
  })

  it('in_app_enabled false turns inApp off', () => {
    expect(
      resolveChannels({ user_id: 'u1', in_app_enabled: false, email_enabled: true, email_frequency: 'immediate' })
    ).toEqual({ inApp: false, email: true })
  })
})

describe('firstName', () => {
  it('takes the first token of a full name', () => {
    expect(firstName('Ada Lovelace', 'en')).toBe('Ada')
  })

  it('falls back to "there" for null in en', () => {
    expect(firstName(null, 'en')).toBe('there')
  })

  it('falls back to "estudiante" for null in es', () => {
    expect(firstName(null, 'es')).toBe('estudiante')
  })

  it('falls back for a whitespace-only name', () => {
    expect(firstName('  ', 'en')).toBe('there')
    expect(firstName('  ', 'es')).toBe('estudiante')
  })
})

describe('pickTemplate', () => {
  const tenantId = 'tenant-1'
  const globalRow = { id: 1, name: 'daily_digest_en', title: 'Global title', content: 'Global content', tenant_id: null }
  const tenantRow = {
    id: 2,
    name: 'daily_digest_en',
    title: 'Tenant title',
    content: 'Tenant content',
    tenant_id: 'tenant-1',
  }
  const otherTenantRow = {
    id: 3,
    name: 'daily_digest_en',
    title: 'Other tenant title',
    content: 'Other tenant content',
    tenant_id: 'tenant-2',
  }

  it('prefers the tenant-specific row over the global row', () => {
    const result = pickTemplate([globalRow, tenantRow], 'daily_digest', 'en', tenantId)
    expect(result).toEqual({ id: 2, title: 'Tenant title', content: 'Tenant content' })
  })

  it('uses the global row (tenant_id null) when there is no tenant-specific row', () => {
    const result = pickTemplate([globalRow, otherTenantRow], 'daily_digest', 'en', tenantId)
    expect(result).toEqual({ id: 1, title: 'Global title', content: 'Global content' })
  })

  it('falls back to built-in copy (id null) when no rows match name/tenant/locale', () => {
    const result = pickTemplate([otherTenantRow], 'daily_digest', 'en', tenantId)
    expect(result.id).toBeNull()
    expect(result.title).toBe('Your day at {{school_name}}')
    expect(result.content).toBe('{{summary}}. A few minutes today keeps you on track.')
  })

  it('falls back to built-in copy for streak_nudge/es when rows list is empty', () => {
    const result = pickTemplate([], 'streak_nudge', 'es', tenantId)
    expect(result.id).toBeNull()
    expect(result.title).toBe('Tu racha de {{streak}} días termina esta noche')
  })
})

describe('tenantBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses http for a lvh.me platform domain', () => {
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_DOMAIN', 'lvh.me:3000')
    expect(tenantBaseUrl('slug')).toBe('http://slug.lvh.me:3000')
  })

  it('uses https for a non-local platform domain', () => {
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_DOMAIN', 'example.com')
    expect(tenantBaseUrl('slug')).toBe('https://slug.example.com')
  })

  it('falls back to the "app" subdomain when slug is null', () => {
    vi.stubEnv('NEXT_PUBLIC_PLATFORM_DOMAIN', 'example.com')
    expect(tenantBaseUrl(null)).toBe('https://app.example.com')
  })
})
