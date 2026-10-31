/* eslint-disable @typescript-eslint/no-explicit-any -- loose fake of the supabase client */
/**
 * Challenges F1: a member's first official attempt is mirrored into the normal
 * exercise tables once (evaluation + completion, XP once); guests are mirrored
 * at claim; practice attempts never are.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/challenges/limits', () => ({ checkChallengeLimits: vi.fn(async () => ({ status: 'ok', official: true })) }))

const db = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, xp: 0, access: true, seq: 0 }))
const supa = vi.hoisted(() => ({ ctx: { cookie: undefined as string | undefined } }))

function getPath(row: any, col: string) {
  if (col.includes('->>')) {
    const [c, k] = col.split('->>')
    return row[c]?.[k]
  }
  return row[col]
}

/** Stateful fake: filters, insert, upsert with a unique key (+ XP trigger on completion insert). */
function fakeAdmin() {
  return {
    rpc: async (fn: string) => (fn === 'has_course_access' ? { data: db.access, error: null } : { data: null, error: null }),
    from(table: string) {
      db.tables[table] ??= []
      const all = db.tables[table]
      const filters: Array<(r: any) => boolean> = []
      let lim = Infinity
      let pending: (() => { data: any; error: any }) | null = null
      const rows = () => all.filter((r) => filters.every((f) => f(r))).slice(0, lim)
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => getPath(r, c) === v), q),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
        gt: (c: string, v: number) => (filters.push((r) => r[c] > v), q),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
        update: (patch: any) => {
          pending = () => {
            const hit = rows()
            hit.forEach((r) => Object.assign(r, patch))
            return { data: hit.map((r) => ({ id: r.id })), error: null }
          }
          return q
        },
        order: () => q,
        limit: (n: number) => ((lim = n), q),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => (pending ? pending() : { data: rows()[0] ?? null, error: null }),
        then: (res: any) => res(pending ? pending() : { data: rows(), error: null }),
        insert: (row: any) => {
          pending = () => {
            if (table === 'challenge_attempts' && row.is_official) {
              const dup = all.some(
                (r) => r.is_official && r.exercise_id === row.exercise_id && r.user_id && r.user_id === row.user_id
              )
              if (dup) return { data: null, error: { code: '23505', message: 'challenge_attempts_official_user_uidx' } }
            }
            const saved = { id: `${table}-${++db.seq}`, ...row }
            all.push(saved)
            return { data: saved, error: null }
          }
          return q
        },
        upsert: (row: any) => {
          pending = () => {
            const dup = all.some((r) => r.exercise_id === row.exercise_id && r.user_id === row.user_id)
            if (dup) return { data: [], error: null }
            all.push({ id: ++db.seq, ...row })
            if (table === 'exercise_completions') db.xp += 1 // AFTER INSERT XP trigger
            return { data: [{ id: db.seq }], error: null }
          }
          return q
        },
      }
      return q
    },
  } as any
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => Promise.resolve('t1') }))
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: (n: string) => (n === 'reto_guest' && supa.ctx.cookie ? { value: supa.ctx.cookie } : undefined) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
      rpc: async () => ({ error: null }),
    }),
}))
vi.mock('@/lib/tenant/join-school', () => ({ BANNED_MESSAGE: 'banned' }))

import { materializeChallengeAttempt } from '@/lib/challenges/materialize'
import { submitChallengeAttempt, type AttemptDeps } from '@/lib/challenges/attempt'
import { claimChallenge } from '@/app/actions/challenge-claim'
import { hashWithSecret, newGuestToken } from '@/lib/challenges/identity'
import { resolveRubric, rubricVersion } from '@/lib/challenges/grade'

const T = 't1'
const member = { userId: 'u1', guestTokenHash: null, ipHash: 'ip' }
const grade = vi.fn(async () => ({
  score: 80, passed: true, passingScore: 60, feedback: 'good', strengths: ['a'], improvements: ['b'], criteria: [],
}))

function seed(extra: Record<string, any[]> = {}) {
  db.xp = 0
  db.access = true
  db.seq = 0
  db.tables = {
    challenge_links: [{ id: 'l1', token: 'tok', tenant_id: T, exercise_id: 7, active: true }],
    tenant_settings: [{ tenant_id: T, setting_key: 'challenges_enabled', setting_value: true }],
    tenant_users: [{ tenant_id: T, user_id: 'u1', status: 'active' }],
    exercises: [
      { id: 7, course_id: 5, tenant_id: T, title: 'T', instructions: 'i', exercise_type: 'essay', exercise_config: { passing_score: 60 }, status: 'published', is_challengeable: true },
    ],
    challenge_attempts: [],
    exercise_evaluations: [],
    exercise_completions: [],
    lesson_checkpoints: [],
    ...extra,
  }
}

function deps(): AttemptDeps {
  const admin = fakeAdmin()
  return {
    admin,
    hostTenantId: T,
    hasAiGrading: async () => true,
    grade,
    materialize: (i) => materializeChallengeAttempt(admin, i),
  }
}

beforeEach(() => {
  grade.mockClear()
  vi.stubEnv('CHALLENGE_HASH_SECRET', 'test-secret')
  seed()
})

describe('member official attempt is mirrored once', () => {
  it('writes an evaluation + completion and grants XP once', async () => {
    const out = await submitChallengeAttempt(deps(), { token: 'tok', answer: 'my answer' }, member)
    expect(out).toMatchObject({ ok: true, result: { isOfficial: true, score: 80 } })
    expect(db.tables.exercise_evaluations).toHaveLength(1)
    expect(db.tables.exercise_evaluations[0]).toMatchObject({
      exercise_id: 7, user_id: 'u1', tenant_id: T, engine_type: 'text', score: 80, passed: true, submission_text: 'my answer',
    })
    expect(db.tables.exercise_completions).toHaveLength(1)
    expect(db.xp).toBe(1)
  })

  it('same answer again (idempotent retry) does not duplicate evaluation or XP', async () => {
    await submitChallengeAttempt(deps(), { token: 'tok', answer: 'a' }, member)
    await submitChallengeAttempt(deps(), { token: 'tok', answer: 'a' }, member)
    expect(grade).toHaveBeenCalledTimes(1)
    expect(db.tables.exercise_evaluations).toHaveLength(1)
    expect(db.xp).toBe(1)
  })

  it('one official attempt per user: a second, different answer is practice and is not mirrored', async () => {
    await submitChallengeAttempt(deps(), { token: 'tok', answer: 'a' }, member)
    const second = await submitChallengeAttempt(deps(), { token: 'tok', answer: 'b' }, member)
    expect(second).toMatchObject({ ok: true, result: { isOfficial: false, officialAlreadyTaken: true } })
    expect(db.tables.challenge_attempts.filter((a) => a.is_official)).toHaveLength(1)
    expect(db.tables.exercise_evaluations).toHaveLength(1)
    expect(db.xp).toBe(1)
  })

  it('no double XP when the member already completed the exercise normally', async () => {
    seed({ exercise_completions: [{ id: 99, exercise_id: 7, user_id: 'u1', score: 70 }] })
    await submitChallengeAttempt(deps(), { token: 'tok', answer: 'a' }, member)
    expect(db.tables.exercise_completions).toHaveLength(1)
    expect(db.xp).toBe(0)
    expect(db.tables.exercise_evaluations).toHaveLength(1)
  })

  it('failing score records the evaluation but no completion', async () => {
    grade.mockResolvedValueOnce({ score: 30, passed: false, passingScore: 60, feedback: 'x', strengths: [], improvements: [], criteria: [] })
    await submitChallengeAttempt(deps(), { token: 'tok', answer: 'a' }, member)
    expect(db.tables.exercise_evaluations).toHaveLength(1)
    expect(db.tables.exercise_completions).toHaveLength(0)
    expect(db.xp).toBe(0)
  })

  it('skips mirroring (attempt still stored) without course access', async () => {
    db.access = false
    const out = await submitChallengeAttempt(deps(), { token: 'tok', answer: 'a' }, member)
    expect(out).toMatchObject({ ok: true, result: { isOfficial: true } })
    expect(db.tables.exercise_evaluations).toHaveLength(0)
    expect(db.xp).toBe(0)
  })

  it('a mirroring failure never fails the attempt', async () => {
    const d = deps()
    d.materialize = async () => {
      throw new Error('boom')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await submitChallengeAttempt(d, { token: 'tok', answer: 'a' }, member)
    expect(out.ok).toBe(true)
  })

  it('guest attempts are not mirrored by the attempt call', async () => {
    await submitChallengeAttempt(deps(), { token: 'tok', answer: 'a' }, { userId: null, guestTokenHash: 'gh', ipHash: 'ip' })
    expect(db.tables.exercise_evaluations).toHaveLength(0)
    expect(db.xp).toBe(0)
  })

  it('stores a rubric_version fingerprint that changes with the rubric', async () => {
    await submitChallengeAttempt(deps(), { token: 'tok', answer: 'a' }, member)
    const stored = db.tables.challenge_attempts[0].rubric_version
    expect(stored).toBe(rubricVersion(resolveRubric({ passing_score: 60 })))
    expect(rubricVersion(resolveRubric({ evaluation_criteria: 'one\ntwo' }))).not.toBe(stored)
  })
})

describe('materializeChallengeAttempt', () => {
  it('is idempotent when called repeatedly', async () => {
    db.tables.challenge_attempts = [
      { id: 'a1', tenant_id: T, exercise_id: 7, user_id: 'u1', is_official: true, score: 90, passed: true, answer: { text: 'x' }, feedback: {} },
    ]
    const admin = fakeAdmin()
    const input = { attemptId: 'a1', tenantId: T, userId: 'u1' }
    expect(await materializeChallengeAttempt(admin, input)).toMatchObject({ status: 'done', evaluationCreated: true, completionCreated: true })
    expect(await materializeChallengeAttempt(admin, input)).toMatchObject({ status: 'done', evaluationCreated: false, completionCreated: false })
    expect(db.tables.exercise_evaluations).toHaveLength(1)
    expect(db.xp).toBe(1)
  })

  it('never mirrors a practice attempt or another tenant/user attempt', async () => {
    db.tables.challenge_attempts = [
      { id: 'p1', tenant_id: T, exercise_id: 7, user_id: 'u1', is_official: false, score: 90, passed: true, answer: { text: 'x' }, feedback: {} },
    ]
    const admin = fakeAdmin()
    expect(await materializeChallengeAttempt(admin, { attemptId: 'p1', tenantId: T, userId: 'u1' })).toEqual({ status: 'skipped', reason: 'not_official' })
    expect(await materializeChallengeAttempt(admin, { attemptId: 'p1', tenantId: 'other', userId: 'u1' })).toEqual({ status: 'skipped', reason: 'not_official' })
    expect(db.tables.exercise_evaluations).toHaveLength(0)
  })

  it('skips text exercises embedded as lesson checkpoints', async () => {
    db.tables.lesson_checkpoints = [{ exercise_id: 7, tenant_id: T, is_enabled: true, lesson_id: 3 }]
    db.tables.challenge_attempts = [
      { id: 'a1', tenant_id: T, exercise_id: 7, user_id: 'u1', is_official: true, score: 90, passed: true, answer: { text: 'x' }, feedback: {} },
    ]
    expect(await materializeChallengeAttempt(fakeAdmin(), { attemptId: 'a1', tenantId: T, userId: 'u1' })).toEqual({
      status: 'skipped',
      reason: 'checkpoint_exercise',
    })
  })
})

describe('guest claim materialization', () => {
  it('after claim on a free course, the guest official attempt is mirrored once (XP once, repeat claim is a no-op)', async () => {
    const token = newGuestToken()
    supa.ctx.cookie = token
    seed({
      challenge_attempts: [
        {
          id: 'g1', tenant_id: T, exercise_id: 7, user_id: null, guest_token_hash: hashWithSecret('guest', token),
          is_official: true, score: 85, passed: true, answer: { text: 'guest answer' }, feedback: { feedback: 'ok' },
          created_at: '2026-10-29T10:00:00Z',
        },
      ],
    })
    const first = await claimChallenge('tok')
    expect(first).toMatchObject({ success: true, accessGranted: true })
    expect(db.tables.challenge_attempts[0].user_id).toBe('u1')
    expect(db.tables.exercise_evaluations).toHaveLength(1)
    expect(db.tables.exercise_evaluations[0]).toMatchObject({ user_id: 'u1', score: 85, submission_text: 'guest answer' })
    expect(db.xp).toBe(1)

    await claimChallenge('tok')
    expect(db.tables.exercise_evaluations).toHaveLength(1)
    expect(db.xp).toBe(1)
  })

  it('paid course: attempt is claimed but nothing is mirrored (no access)', async () => {
    const token = newGuestToken()
    supa.ctx.cookie = token
    seed({
      products: [{ tenant_id: T, product_id: 1, price: 50 }],
      product_courses: [{ tenant_id: T, course_id: 5, product_id: 1 }],
      challenge_attempts: [
        {
          id: 'g1', tenant_id: T, exercise_id: 7, user_id: null, guest_token_hash: hashWithSecret('guest', token),
          is_official: true, score: 85, passed: true, answer: { text: 'x' }, feedback: {}, created_at: '2026-10-29T10:00:00Z',
        },
      ],
    })
    expect(await claimChallenge('tok')).toMatchObject({ success: true, requiresPurchase: true })
    expect(db.tables.exercise_evaluations).toHaveLength(0)
    expect(db.xp).toBe(0)
  })
})
