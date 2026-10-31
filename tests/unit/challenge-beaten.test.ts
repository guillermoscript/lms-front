/* eslint-disable @typescript-eslint/no-explicit-any -- loose fake of the supabase client */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, v?: Record<string, string>) =>
    key === 'content' ? `${v?.name} beat you on ${v?.exercise}` : key,
}))
vi.mock('@/lib/i18n/tenant-locale', () => ({ resolveTenantLocale: async () => 'en' }))

import { notifyChallengeBeaten, BEATEN_THROTTLE_MS } from '@/lib/challenges/beaten'
import { submitChallengeAttempt, type AttemptDeps } from '@/lib/challenges/attempt'

vi.mock('@/lib/challenges/limits', () => ({ checkChallengeLimits: vi.fn(async () => ({ status: 'ok', official: true })) }))

const T = 'tenant-a'
const NOW = new Date('2026-10-31T12:00:00Z')

function fakeAdmin(tables: Record<string, any[]>, opts: { failNotificationInsert?: boolean } = {}) {
  let nid = 100
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q),
        contains: (k: string, v: any) => {
          rows = rows.filter((r) =>
            Array.isArray(v) ? v.every((x) => (r[k] ?? []).includes(x)) : Object.entries(v).every(([kk, vv]) => r[k]?.[kk] === vv)
          )
          return q
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (res: any) => res({ data: rows, error: null }),
        insert: (row: any) => {
          const failed = table === 'notifications' && opts.failNotificationInsert
          const saved = { id: ++nid, created_at: NOW.toISOString(), ...row }
          if (!failed) tables[table] = [...(tables[table] ?? []), saved]
          return {
            select: () => ({
              single: async () => (failed ? { data: null, error: { code: '23514', message: 'type not allowed' } } : { data: saved, error: null }),
            }),
            then: (res: any) => res({ error: failed ? { message: 'x' } : null }),
          }
        },
      }
      return q
    },
  } as any
}

function world(over: Partial<Record<string, any[]>> = {}) {
  return {
    challenge_attempts: [
      { id: 'own', tenant_id: T, user_id: 'owner', exercise_id: 7, score: 70, is_official: true },
      { id: 'beat', tenant_id: T, user_id: 'beater', exercise_id: 7, score: 90, is_official: true },
    ],
    challenge_links: [{ id: 'l1', tenant_id: T, exercise_id: 7, token: 'tok', created_by: 'owner', owner_attempt_id: 'own', active: true }],
    exercises: [{ id: 7, tenant_id: T, title: 'Pitch' }],
    profiles: [{ id: 'beater', full_name: 'Ana Maria Lopez' }],
    notifications: [],
    user_notifications: [],
    ...over,
  } as Record<string, any[]>
}

const run = (tables: Record<string, any[]>, attemptId = 'beat', opts = {}) =>
  notifyChallengeBeaten({ admin: fakeAdmin(tables, opts), tenantId: T, attemptId, now: NOW })

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

describe('notifyChallengeBeaten', () => {
  it('notifies the link owner with name, exercise and the member route', async () => {
    const tables = world()
    expect(await run(tables)).toBe(1)
    const n = tables.notifications[0]
    expect(n.target_user_ids).toEqual(['owner'])
    expect(n.tenant_id).toBe(T)
    expect(n.content).toBe('Ana L. beat you on Pitch')
    expect(n.metadata).toMatchObject({ kind: 'challengeBeaten', link: '/dashboard/student/challenges/tok', exercise_id: 7, beater_attempt_id: 'beat' })
    expect(tables.user_notifications).toEqual([expect.objectContaining({ user_id: 'owner', notification_id: n.id })])
  })

  it('falls back to "friend" when the beater has no name', async () => {
    const tables = world({ profiles: [] })
    await run(tables)
    expect(tables.notifications[0].content).toBe('friend beat you on Pitch')
  })

  it('does nothing on a tie or a lower score', async () => {
    for (const score of [70, 40]) {
      const tables = world()
      tables.challenge_attempts[1].score = score
      expect(await run(tables)).toBe(0)
      expect(tables.notifications).toHaveLength(0)
    }
  })

  it('never notifies the owner about their own attempt', async () => {
    const tables = world()
    tables.challenge_attempts[1].user_id = 'owner'
    expect(await run(tables)).toBe(0)
  })

  it('ignores practice attempts, unclaimed guests, inactive links and links without an owner attempt', async () => {
    let t = world(); t.challenge_attempts[1].is_official = false
    expect(await run(t)).toBe(0)
    t = world(); t.challenge_attempts[1].user_id = null
    expect(await run(t)).toBe(0)
    t = world(); t.challenge_links[0].active = false
    expect(await run(t)).toBe(0)
    t = world(); t.challenge_links[0].owner_attempt_id = null
    expect(await run(t)).toBe(0)
  })

  it('ignores a guest-owned link owner (no member to notify) and other tenants', async () => {
    let t = world(); t.challenge_attempts[0].user_id = null
    expect(await run(t)).toBe(0)
    t = world(); t.challenge_attempts[0].tenant_id = 'other'
    expect(await run(t)).toBe(0)
  })

  it('is idempotent per beater attempt, even after the throttle window', async () => {
    const tables = world()
    await run(tables)
    tables.notifications[0].created_at = new Date(NOW.getTime() - 3 * BEATEN_THROTTLE_MS).toISOString()
    expect(await run(tables)).toBe(0)
    expect(tables.notifications).toHaveLength(1)
  })

  it('throttles a different beater within 24h, then allows it after', async () => {
    const tables = world()
    tables.challenge_attempts.push({ id: 'beat2', tenant_id: T, user_id: 'other', exercise_id: 7, score: 95, is_official: true })
    await run(tables)
    expect(await run(tables, 'beat2')).toBe(0)
    tables.notifications[0].created_at = new Date(NOW.getTime() - BEATEN_THROTTLE_MS - 1000).toISOString()
    expect(await run(tables, 'beat2')).toBe(1)
  })

  it('throttle is per exercise', async () => {
    const tables = world()
    await run(tables)
    tables.challenge_attempts.push(
      { id: 'own8', tenant_id: T, user_id: 'owner', exercise_id: 8, score: 10, is_official: true },
      { id: 'beat8', tenant_id: T, user_id: 'beater', exercise_id: 8, score: 50, is_official: true }
    )
    tables.challenge_links.push({ id: 'l8', tenant_id: T, exercise_id: 8, token: 'tok8', owner_attempt_id: 'own8', active: true })
    expect(await run(tables, 'beat8')).toBe(1)
  })

  it('never throws: a rejected notification type is logged and skipped', async () => {
    const tables = world()
    expect(await run(tables, 'beat', { failNotificationInsert: true })).toBe(0)
    expect(console.error).toHaveBeenCalled()
  })

  it('never throws when the admin client explodes', async () => {
    const admin = { from: () => { throw new Error('db down') } } as any
    expect(await notifyChallengeBeaten({ admin, tenantId: T, attemptId: 'beat' })).toBe(0)
  })
})

describe('runAttempt hook', () => {
  const baseTables = () => ({
    challenge_links: [{ id: 'l1', token: 'tok', tenant_id: T, exercise_id: 7, active: true }],
    tenant_settings: [{ tenant_id: T, setting_key: 'challenges_enabled', setting_value: true }],
    exercises: [{ id: 7, tenant_id: T, title: 'T', instructions: 'i', exercise_type: 'essay', exercise_config: {}, status: 'published', is_challengeable: true }],
    challenge_attempts: [] as any[],
  })
  const fake = (tables: any) => ({
    from(table: string) {
      const rows = tables[table] ?? []
      const q: any = {
        select: () => q, eq: () => q, order: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (res: any) => res({ data: rows }),
        insert: (row: any) => ({ select: () => ({ single: async () => ({ data: { id: 'new', ...row }, error: null }) }) }),
      }
      return q
    },
  }) as any
  const grade = async () => ({ score: 80, passed: true, passingScore: 60, feedback: '', strengths: [], improvements: [], criteria: [] })
  const mk = (hook: AttemptDeps['onOfficialAttempt']): AttemptDeps => ({
    admin: fake(baseTables()), hostTenantId: T, hasAiGrading: async () => true, grade: grade as any, onOfficialAttempt: hook,
  })

  it('fires for a member official attempt', async () => {
    const hook = vi.fn(async () => 1)
    await submitChallengeAttempt(mk(hook), { token: 'tok', answer: 'a' }, { userId: 'u', guestTokenHash: null, ipHash: 'ip' })
    expect(hook).toHaveBeenCalledWith({ attemptId: 'new', tenantId: T })
  })

  it('does not fire for a guest attempt', async () => {
    const hook = vi.fn()
    await submitChallengeAttempt(mk(hook), { token: 'tok', answer: 'a' }, { userId: null, guestTokenHash: 'g', ipHash: 'ip' })
    expect(hook).not.toHaveBeenCalled()
  })

  it('a throwing hook never fails the attempt', async () => {
    const out = await submitChallengeAttempt(
      mk(async () => { throw new Error('boom') }), { token: 'tok', answer: 'a' }, { userId: 'u', guestTokenHash: null, ipHash: 'ip' }
    )
    expect(out.ok).toBe(true)
  })
})
