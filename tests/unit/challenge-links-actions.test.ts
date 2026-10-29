import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ME = '33333333-3333-4333-8333-333333333333'
const SOMEONE = '44444444-4444-4444-8444-444444444444'

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  ctx: { role: 'student', userId: '', tenantId: '' } as { role: string; userId: string; tenantId: string },
  tables: {} as Record<string, Row[]>,
  updates: [] as { table: string; payload: Row; eqs: [string, unknown][] }[],
  inserts: [] as { table: string; row: Row }[],
}))

function builder(table: string) {
  const eqs: [string, unknown][] = []
  let op: 'select' | 'update' | 'insert' | 'upsert' = 'select'
  let payload: Row = {}
  const rows = () => (h.tables[table] ??= []).filter((r) => eqs.every(([c, v]) => r[c] === v))
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), b),
    in: () => b,
    order: () => b,
    limit: () => b,
    update: (p: Row) => ((op = 'update'), (payload = p), b),
    insert: (p: Row) => ((op = 'insert'), (payload = p), b),
    upsert: (p: Row) => ((op = 'upsert'), (payload = p), b),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => {
      if (op === 'insert') {
        h.inserts.push({ table, row: payload })
        return { data: { id: 'link-1', token: payload.token }, error: null }
      }
      return { data: rows()[0] ?? null, error: null }
    },
    then: (res: (v: unknown) => void) => {
      if (op === 'update') h.updates.push({ table, payload, eqs: [...eqs] })
      res({ data: op === 'select' ? rows() : null, error: null })
    },
  }
  return b
}
const client = { from: (t: string) => builder(t) }

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: async () => h.ctx.tenantId,
  getCurrentUserId: async () => h.ctx.userId,
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: async () => h.ctx.role }))

import {
  createChallengeLink,
  deactivateChallengeLink,
  setExerciseChallengeable,
} from '@/app/actions/challenge-links'
import { updateChallengeSettings } from '@/app/actions/admin/settings'

beforeEach(() => {
  h.ctx = { role: 'student', userId: ME, tenantId: TENANT }
  h.updates = []
  h.inserts = []
  h.tables = {
    tenant_settings: [{ tenant_id: TENANT, setting_key: 'challenges_enabled', setting_value: { enabled: true } }],
    exercises: [{ id: 5, tenant_id: TENANT, course_id: 9, is_challengeable: true, exercise_type: 'essay' }],
    courses: [{ course_id: 9, tenant_id: TENANT, author_id: SOMEONE }],
    challenge_attempts: [{ id: 'a1', tenant_id: TENANT, exercise_id: 5, user_id: ME, is_official: true }],
    challenge_links: [{ id: 'l1', tenant_id: TENANT, created_by: SOMEONE }],
  }
})

describe('setExerciseChallengeable', () => {
  it('rejects a student', async () => {
    const r = await setExerciseChallengeable(5, true)
    expect(r.success).toBe(false)
    expect(h.updates).toHaveLength(0)
  })
  it('rejects a teacher on another teacher’s course', async () => {
    h.ctx.role = 'teacher'
    expect((await setExerciseChallengeable(5, true)).success).toBe(false)
    expect(h.updates).toHaveLength(0)
  })
  it('lets a teacher mark an exercise in their own course', async () => {
    h.ctx.role = 'teacher'
    h.tables.courses[0].author_id = ME
    expect((await setExerciseChallengeable(5, false)).success).toBe(true)
    expect(h.updates[0].payload).toEqual({ is_challengeable: false })
    expect(h.updates[0].eqs).toContainEqual(['tenant_id', TENANT])
  })
  it('lets an admin mark any exercise in the tenant', async () => {
    h.ctx.role = 'admin'
    expect((await setExerciseChallengeable(5, true)).success).toBe(true)
  })
  it('does not see an exercise from another tenant', async () => {
    h.ctx.role = 'admin'
    h.ctx.tenantId = OTHER
    expect((await setExerciseChallengeable(5, true)).success).toBe(false)
  })
})

describe('updateChallengeSettings', () => {
  it('rejects non-admins', async () => {
    for (const role of ['student', 'teacher']) {
      h.ctx.role = role
      expect((await updateChallengeSettings({ enabled: true, guestMonthlyCap: 10 })).success).toBe(false)
    }
  })
  it('rejects an invalid cap for admins', async () => {
    h.ctx.role = 'admin'
    expect((await updateChallengeSettings({ enabled: true, guestMonthlyCap: -1 })).success).toBe(false)
    expect((await updateChallengeSettings({ enabled: true, guestMonthlyCap: 1.5 })).success).toBe(false)
  })
})

describe('createChallengeLink', () => {
  it('creates a nanoid link for the caller’s own official attempt', async () => {
    const r = await createChallengeLink('a1')
    expect(r.success).toBe(true)
    const row = h.inserts[0].row
    expect(row).toMatchObject({ tenant_id: TENANT, exercise_id: 5, created_by: ME, owner_attempt_id: 'a1' })
    expect(String(row.token)).toMatch(/^[A-Za-z0-9_-]{12}$/)
  })
  it('refuses someone else’s attempt', async () => {
    h.tables.challenge_attempts[0].user_id = SOMEONE
    expect((await createChallengeLink('a1')).success).toBe(false)
  })
  it('refuses a non-official attempt', async () => {
    h.tables.challenge_attempts[0].is_official = false
    expect((await createChallengeLink('a1')).success).toBe(false)
  })
  it('refuses when the tenant has challenges disabled', async () => {
    h.tables.tenant_settings = []
    expect((await createChallengeLink('a1')).success).toBe(false)
  })
  it('refuses a non-challengeable exercise', async () => {
    h.tables.exercises[0].is_challengeable = false
    expect((await createChallengeLink('a1')).success).toBe(false)
  })
})

describe('deactivateChallengeLink', () => {
  it('refuses a non-owner non-admin', async () => {
    expect((await deactivateChallengeLink('l1')).success).toBe(false)
    expect(h.updates).toHaveLength(0)
  })
  it('lets the owner deactivate, scoped to the tenant', async () => {
    h.tables.challenge_links[0].created_by = ME
    expect((await deactivateChallengeLink('l1')).success).toBe(true)
    expect(h.updates[0].payload).toEqual({ active: false })
    expect(h.updates[0].eqs).toContainEqual(['tenant_id', TENANT])
  })
  it('lets an admin deactivate any link in the tenant but not another tenant’s', async () => {
    h.ctx.role = 'admin'
    expect((await deactivateChallengeLink('l1')).success).toBe(true)
    h.ctx.tenantId = OTHER
    expect((await deactivateChallengeLink('l1')).success).toBe(false)
  })
})

describe('setExerciseChallengeable type and tenant gates', () => {
  it('rejects non-essay/discussion types and a disabled tenant', async () => {
    h.ctx.role = 'admin'
    h.tables.exercises[0].exercise_type = 'quiz'
    expect((await setExerciseChallengeable(5, true)).success).toBe(false)
    h.tables.exercises[0].exercise_type = 'essay'
    h.tables.tenant_settings = []
    expect((await setExerciseChallengeable(5, true)).success).toBe(false)
    expect((await setExerciseChallengeable(5, false)).success).toBe(true)
  })
})
