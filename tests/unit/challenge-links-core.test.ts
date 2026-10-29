import { beforeEach, describe, expect, it } from 'vitest'
import { createLinkCore, deactivateLinkCore, setChallengeableCore, type ChallengeActor } from '@/lib/challenges/links'

const T = 'tenant-a'
const OTHER_T = 'tenant-b'
const ME = 'user-me'
const SOMEONE = 'user-other'

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let inserts: Row[]
let updates: { table: string; payload: Row }[]

function builder(table: string) {
  const f: [string, unknown][] = []
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Row = {}
  const sort: [string, boolean][] = []
  const match = () =>
    (tables[table] ??= [])
      .filter((r) => f.every(([c, v]) => (v === null ? r[c] == null : r[c] === v)))
      .sort((a, b) => {
        for (const [c, asc] of sort) {
          const d = (a[c] as number | string) < (b[c] as number | string) ? -1 : (a[c] as number | string) > (b[c] as number | string) ? 1 : 0
          if (d) return asc ? d : -d
        }
        return 0
      })
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => (f.push([c, v]), b),
    is: (c: string, v: unknown) => (f.push([c, v]), b),
    order: (c: string, o?: { ascending?: boolean }) => (sort.push([c, o?.ascending !== false]), b),
    limit: () => b,
    insert: (p: Row) => ((op = 'insert'), (payload = p), b),
    update: (p: Row) => ((op = 'update'), (payload = p), b),
    maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
    single: async () => {
      inserts.push(payload)
      const row = { id: `link-${inserts.length}`, active: true, ...payload }
      ;(tables[table] ??= []).push(row)
      return { data: { id: row.id, token: payload.token }, error: null }
    },
    then: (res: (v: unknown) => void) => {
      if (op === 'update') updates.push({ table, payload })
      res({ data: null, error: null })
    },
  }
  return b
}
const admin = { from: (t: string) => builder(t) } as never
let plan = true
const deps = () => ({ admin, hasAiGrading: async () => plan })
const actor = (role: ChallengeActor['role'], tenantId = T): ChallengeActor => ({ tenantId, userId: ME, role })

beforeEach(() => {
  plan = true
  inserts = []
  updates = []
  tables = {
    tenant_settings: [{ tenant_id: T, setting_key: 'challenges_enabled', setting_value: { enabled: true } }],
    exercises: [
      { id: 5, tenant_id: T, course_id: 9, is_challengeable: true, exercise_type: 'essay' },
      { id: 6, tenant_id: T, course_id: 9, is_challengeable: true, exercise_type: 'quiz' },
      { id: 7, tenant_id: T, course_id: 9, is_challengeable: false, exercise_type: 'essay' },
    ],
    courses: [{ course_id: 9, tenant_id: T, author_id: ME }],
    challenge_attempts: [
      { id: 'a-low', tenant_id: T, exercise_id: 5, user_id: ME, is_official: true, score: 60, created_at: '1' },
      { id: 'a-best', tenant_id: T, exercise_id: 5, user_id: ME, is_official: true, score: 87, created_at: '2' },
      { id: 'a-theirs', tenant_id: T, exercise_id: 5, user_id: SOMEONE, is_official: true, score: 99, created_at: '3' },
    ],
    challenge_links: [],
  }
})

describe('createLinkCore: open links', () => {
  it('teacher on own course gets an open link (no attempt, no score), nanoid token', async () => {
    const r = await createLinkCore(deps(), actor('teacher'), { exerciseId: 5 })
    expect(r).toMatchObject({ ok: true, data: { withScore: false, score: null, reused: false, fellBackToOpen: false } })
    expect(inserts[0]).toMatchObject({ tenant_id: T, exercise_id: 5, created_by: ME, owner_attempt_id: null })
    expect(String(inserts[0].token)).toMatch(/^[A-Za-z0-9_-]{12}$/)
  })
  it('is idempotent per exercise + creator', async () => {
    await createLinkCore(deps(), actor('teacher'), { exerciseId: 5 })
    const again = await createLinkCore(deps(), actor('teacher'), { exerciseId: 5 })
    expect(again).toMatchObject({ ok: true, data: { reused: true } })
    expect(inserts).toHaveLength(1)
  })
  it('admin may create for any exercise of the tenant; teacher on another course may not', async () => {
    tables.courses[0].author_id = SOMEONE
    expect((await createLinkCore(deps(), actor('teacher'), { exerciseId: 5 })).ok).toBe(false)
    expect((await createLinkCore(deps(), actor('admin'), { exerciseId: 5 })).ok).toBe(true)
  })
  it('students never get an open link: they must have played', async () => {
    tables.challenge_attempts = []
    for (const opts of [{ exerciseId: 5 }, { exerciseId: 5, useBestAttempt: true }]) {
      expect((await createLinkCore(deps(), actor('student'), opts)).ok).toBe(false)
    }
    expect(inserts).toHaveLength(0)
  })
})

describe('createLinkCore: with score', () => {
  it('use_best_attempt carries the best OFFICIAL own score', async () => {
    const r = await createLinkCore(deps(), actor('teacher'), { exerciseId: 5, useBestAttempt: true })
    expect(r).toMatchObject({ ok: true, data: { withScore: true, score: 87 } })
    expect(inserts[0]).toMatchObject({ owner_attempt_id: 'a-best' })
  })
  it('falls back to an open link, flagged, when there is no official attempt', async () => {
    tables.challenge_attempts = []
    const r = await createLinkCore(deps(), actor('admin'), { exerciseId: 5, useBestAttempt: true })
    expect(r).toMatchObject({ ok: true, data: { withScore: false, fellBackToOpen: true } })
  })
  it('a student can share a result they earned', async () => {
    expect(await createLinkCore(deps(), actor('student'), { exerciseId: 5 })).toMatchObject({ ok: true, data: { score: 87 } })
  })
  it('explicit attempt must be own and official', async () => {
    expect((await createLinkCore(deps(), actor('teacher'), { attemptId: 'a-theirs' })).ok).toBe(false)
    tables.challenge_attempts[1].is_official = false
    expect((await createLinkCore(deps(), actor('teacher'), { attemptId: 'a-best' })).ok).toBe(false)
    expect((await createLinkCore(deps(), actor('teacher'), { attemptId: 'a-low' })).ok).toBe(true)
  })
})

describe('createLinkCore: shared gates', () => {
  it('refuses a disabled tenant, a missing plan feature, other tenants and bad exercises', async () => {
    expect((await createLinkCore(deps(), actor('admin', OTHER_T), { exerciseId: 5 })).ok).toBe(false)
    plan = false
    expect((await createLinkCore(deps(), actor('admin'), { exerciseId: 5 })).ok).toBe(false)
    plan = true
    expect((await createLinkCore(deps(), actor('admin'), { exerciseId: 6 })).ok).toBe(false) // quiz
    expect((await createLinkCore(deps(), actor('admin'), { exerciseId: 7 })).ok).toBe(false) // not challengeable
    tables.tenant_settings = []
    expect((await createLinkCore(deps(), actor('admin'), { exerciseId: 5 })).ok).toBe(false)
    expect(inserts).toHaveLength(0)
  })
})

describe('setChallengeableCore', () => {
  it('students refused; teacher own course ok; other course refused; admin ok', async () => {
    expect((await setChallengeableCore(deps(), actor('student'), 7, true)).ok).toBe(false)
    expect((await setChallengeableCore(deps(), actor('teacher'), 7, true)).ok).toBe(true)
    tables.courses[0].author_id = SOMEONE
    expect((await setChallengeableCore(deps(), actor('teacher'), 7, true)).ok).toBe(false)
    expect((await setChallengeableCore(deps(), actor('admin'), 7, true)).ok).toBe(true)
  })
  it('enabling needs the ai_grading plan; disabling does not', async () => {
    plan = false
    expect((await setChallengeableCore(deps(), actor('admin'), 7, true)).ok).toBe(false)
    expect((await setChallengeableCore(deps(), actor('admin'), 7, false)).ok).toBe(true)
  })
  it('enabling needs essay/discussion and an opted-in tenant; disabling always works', async () => {
    expect((await setChallengeableCore(deps(), actor('admin'), 6, true)).ok).toBe(false)
    tables.tenant_settings = []
    expect((await setChallengeableCore(deps(), actor('admin'), 7, true)).ok).toBe(false)
    expect((await setChallengeableCore(deps(), actor('admin'), 7, false)).ok).toBe(true)
  })
  it('does not see another tenant’s exercise', async () => {
    expect((await setChallengeableCore(deps(), actor('admin', OTHER_T), 5, true)).ok).toBe(false)
  })
})

describe('deactivateLinkCore', () => {
  beforeEach(() => {
    tables.challenge_links = [{ id: 'l1', token: 'tok-aaaaaa', tenant_id: T, created_by: SOMEONE }]
  })
  it('owner or admin only, by token, scoped to the tenant', async () => {
    expect((await deactivateLinkCore(deps(), actor('teacher'), { token: 'tok-aaaaaa' })).ok).toBe(false)
    expect((await deactivateLinkCore(deps(), actor('admin', OTHER_T), { token: 'tok-aaaaaa' })).ok).toBe(false)
    expect((await deactivateLinkCore(deps(), actor('admin'), { token: 'tok-aaaaaa' })).ok).toBe(true)
    expect(updates[0].payload).toEqual({ active: false })
    tables.challenge_links[0].created_by = ME
    expect((await deactivateLinkCore(deps(), actor('student'), { token: 'tok-aaaaaa' })).ok).toBe(true)
  })
})
