/* eslint-disable @typescript-eslint/no-explicit-any -- loose fake of the supabase client */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/challenges/limits', () => ({ checkChallengeLimits: vi.fn(async () => ({ status: 'ok', official: true })) }))

import { computeRubricScore, resolveRubric, resolvePassingScore } from '@/lib/challenges/grade'
import { submitChallengeAttempt, type AttemptDeps } from '@/lib/challenges/attempt'
import { checkChallengeLimits } from '@/lib/challenges/limits'

const TENANT = 'tenant-a'

/** Minimal chainable fake of the admin client, keyed by table. */
function fakeAdmin(tables: Record<string, any[]>, inserts: any[] = []) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q),
        order: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (res: any) => res({ data: rows }),
        insert: (row: any) => {
          const official = row.is_official
          const dup = official && (tables[table] ?? []).some((r) => r.is_official && r.guest_token_hash === row.guest_token_hash)
          const saved = { id: `att-${inserts.length + 1}`, ...row }
          return {
            select: () => ({
              single: async () => {
                if (dup) return { data: null, error: { code: '23505' } }
                inserts.push({ table, row: saved })
                tables[table] = [...(tables[table] ?? []), saved]
                return { data: saved, error: null }
              },
            }),
          }
        },
      }
      return q
    },
  } as any
}

function world(overrides: Partial<Record<string, any[]>> = {}) {
  return {
    challenge_links: [{ id: 'l1', token: 'tok', tenant_id: TENANT, exercise_id: 7, active: true }],
    tenant_settings: [{ tenant_id: TENANT, setting_key: 'challenges_enabled', setting_value: true }],
    exercises: [
      { id: 7, tenant_id: TENANT, title: 'T', instructions: 'i', exercise_type: 'essay', exercise_config: { passing_score: 60 }, status: 'published', is_challengeable: true },
    ],
    challenge_attempts: [],
    ...overrides,
  } as Record<string, any[]>
}

const grade = vi.fn(async () => ({
  score: 80, passed: true, passingScore: 60, feedback: 'good', strengths: ['a'], improvements: ['b'], criteria: [],
}))

function deps(tables: Record<string, any[]>, extra: Partial<AttemptDeps> = {}, inserts: any[] = []): AttemptDeps {
  return { admin: fakeAdmin(tables, inserts), hostTenantId: TENANT, hasAiGrading: async () => true, grade, ...extra }
}
const guest = { userId: null, guestTokenHash: 'g1', ipHash: 'ip' }

beforeEach(() => {
  grade.mockClear()
  vi.mocked(checkChallengeLimits).mockResolvedValue({ status: 'ok', official: true })
})

describe('rubric scoring', () => {
  const rubric = resolveRubric({ rubric: { criteria: [{ id: 'a', description: 'A', weight: 2 }, { id: 'b', description: 'B', weight: 1 }, { id: 'c', description: 'C' }] } })
  it('is deterministic from fixed criterion outputs', () => {
    expect(computeRubricScore(rubric, ['a'])).toBe(50)
    expect(computeRubricScore(rubric, ['b', 'a'])).toBe(75)
    expect(computeRubricScore(rubric, ['a', 'b', 'c', 'zzz'])).toBe(100)
    expect(computeRubricScore(rubric, [])).toBe(0)
  })
  it('falls back to evaluation_criteria lines then a generic rubric', () => {
    expect(resolveRubric({ evaluation_criteria: '- one\n- two\n\n3. three' }).map((c) => c.description)).toEqual(['one', 'two', 'three'])
    expect(resolveRubric({}).length).toBe(4)
  })
  it('passing score defaults to 70', () => {
    expect(resolvePassingScore({})).toBe(70)
    expect(resolvePassingScore({ passing_score: 55 })).toBe(55)
  })
})

describe('submitChallengeAttempt', () => {
  it('first attempt is official, later different answers are practice', async () => {
    const tables = world()
    const inserts: any[] = []
    const d = deps(tables, {}, inserts)
    const first = await submitChallengeAttempt(d, { token: 'tok', answer: 'one' }, guest)
    const second = await submitChallengeAttempt(d, { token: 'tok', answer: 'two' }, guest)
    expect(first).toMatchObject({ ok: true, result: { isOfficial: true, score: 80, alreadyGraded: false } })
    expect(second).toMatchObject({ ok: true, result: { isOfficial: false } })
    expect(inserts.map((i) => i.row.is_official)).toEqual([true, false])
    expect(inserts.every((i) => i.table === 'challenge_attempts')).toBe(true)
  })

  it('same answer returns the stored grade without regrading', async () => {
    const tables = world()
    const d = deps(tables)
    const first = await submitChallengeAttempt(d, { token: 'tok', answer: 'same' }, guest)
    const again = await submitChallengeAttempt(d, { token: 'tok', answer: 'same' }, guest)
    expect(grade).toHaveBeenCalledTimes(1)
    expect(again).toMatchObject({ ok: true, result: { alreadyGraded: true, score: 80, isOfficial: true } })
    if (first.ok && again.ok) expect(again.result.attemptId).toBe(first.result.attemptId)
  })

  it('rejects a link used on another tenant host', async () => {
    const out = await submitChallengeAttempt(deps(world(), { hostTenantId: 'tenant-b' }), { token: 'tok', answer: 'x' }, guest)
    expect(out).toEqual({ ok: false, refusal: 'tenant_mismatch' })
    expect(grade).not.toHaveBeenCalled()
  })

  it.each([
    ['inactive link', { challenge_links: [{ id: 'l1', token: 'tok', tenant_id: TENANT, exercise_id: 7, active: false }] }, 'link_inactive'],
    ['setting missing', { tenant_settings: [] }, 'challenges_disabled'],
    ['not challengeable', { exercises: [{ id: 7, tenant_id: TENANT, exercise_type: 'essay', status: 'published', is_challengeable: false }] }, 'exercise_unavailable'],
    ['draft exercise', { exercises: [{ id: 7, tenant_id: TENANT, exercise_type: 'essay', status: 'draft', is_challengeable: true }] }, 'exercise_unavailable'],
    ['code exercise', { exercises: [{ id: 7, tenant_id: TENANT, exercise_type: 'coding_challenge', status: 'published', is_challengeable: true }] }, 'exercise_unavailable'],
  ])('refuses: %s', async (_n, override, refusal) => {
    const out = await submitChallengeAttempt(deps(world(override as any)), { token: 'tok', answer: 'x' }, guest)
    expect(out).toEqual({ ok: false, refusal })
    expect(grade).not.toHaveBeenCalled()
  })

  it('refuses without the ai_grading plan feature', async () => {
    const out = await submitChallengeAttempt(deps(world(), { hasAiGrading: async () => false }), { token: 'tok', answer: 'x' }, guest)
    expect(out).toEqual({ ok: false, refusal: 'plan_feature_required' })
  })

  it('honours limits before grading', async () => {
    vi.mocked(checkChallengeLimits).mockResolvedValue({ status: 'paused' })
    const out = await submitChallengeAttempt(deps(world()), { token: 'tok', answer: 'x' }, guest)
    expect(out).toEqual({ ok: false, refusal: 'paused' })
    expect(grade).not.toHaveBeenCalled()
  })

  it('never returns the answer key or criteria', async () => {
    const out = await submitChallengeAttempt(deps(world()), { token: 'tok', answer: 'x' }, guest)
    expect(JSON.stringify(out)).not.toMatch(/criteria|correctAnswer|rubric/)
  })
})

describe('limits contract', () => {
  it('official:false from limits stores the first attempt as practice', async () => {
    vi.mocked(checkChallengeLimits).mockResolvedValue({ status: 'ok', official: false })
    const inserts: any[] = []
    const out = await submitChallengeAttempt(deps(world(), {}, inserts), { token: 'tok', answer: 'x' }, guest)
    expect(out).toMatchObject({ ok: true, result: { isOfficial: false } })
    expect(inserts[0].row.is_official).toBe(false)
  })

  it('passes userId to limits for members', async () => {
    await submitChallengeAttempt(deps(world()), { token: 'tok', answer: 'x' }, { userId: 'u1', guestTokenHash: null, ipHash: 'ip' })
    expect(checkChallengeLimits).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }))
  })

  it('refuses a concurrent identical submission while one is in flight', async () => {
    let release!: () => void
    const slow = vi.fn(() => new Promise<any>((res) => (release = () => res({ score: 50, passed: false, passingScore: 60, feedback: '', strengths: [], improvements: [], criteria: [] }))))
    const d = deps(world(), { grade: slow })
    const first = submitChallengeAttempt(d, { token: 'tok', answer: 'x' }, guest)
    await new Promise((r) => setTimeout(r, 0))
    const second = await submitChallengeAttempt(d, { token: 'tok', answer: 'x' }, guest)
    expect(second).toEqual({ ok: false, refusal: 'in_progress' })
    release()
    await first
    expect(slow).toHaveBeenCalledTimes(1)
  })

  it('only essay and discussion are challengeable', async () => {
    const quiz = { exercises: [{ id: 7, tenant_id: TENANT, exercise_type: 'quiz', status: 'published', is_challengeable: true }] }
    expect(await submitChallengeAttempt(deps(world(quiz)), { token: 'tok', answer: 'x' }, guest)).toEqual({ ok: false, refusal: 'exercise_unavailable' })
  })
})
