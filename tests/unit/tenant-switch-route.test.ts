/**
 * `POST /api/tenant/switch` + `GET /api/tenant/memberships` (#845) and the
 * seat rules in `lib/tenant/join-school`.
 *
 * What is proven: a member is switched without a seat being spent; a
 * non-member is joined only where the web joins without asking or after an
 * explicit `join: true`; the plan's student cap — pre-check or the `LM001`
 * trigger winning a race — comes back as a 409 `student_limit`; and every
 * refusal leaves `app_metadata` alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'Stu@Example.com', app_metadata: { tenant_id: 'tenant-old' } } as
    | { id: string; email: string; app_metadata: Record<string, unknown> }
    | null,
  tenants: [] as Row[],
  memberships: [] as Row[],
  invitations: [] as Row[],
  maxStudents: -1 as number,
  students: 0,
  insertError: null as { code: string; message: string } | null,
  metaUpdates: [] as { id: string; attrs: Row }[],
  metaError: null as unknown,
  inserts: [] as { table: string; values: Row }[],
  updates: [] as { table: string; values: Row }[],
}))

function builder(table: string) {
  const eqs: [string, unknown][] = []
  const neqs: [string, unknown][] = []
  let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  let limitN = Infinity

  const source = (): Row[] =>
    table === 'tenants' ? state.tenants
    : table === 'tenant_users' ? state.memberships
    : table === 'tenant_invitations' ? state.invitations
    : []
  const rows = () =>
    source()
      .filter((r) => eqs.every(([c, v]) => c.includes('.') || r[c] === v))
      .filter((r) => neqs.every(([c, v]) => r[c] !== v))
      .slice(0, limitN)
  const result = () => {
    if (op === 'insert') return { data: null, error: state.insertError }
    if (op !== 'select') return { data: null, error: null }
    return { data: rows(), error: null }
  }

  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), b),
    neq: (c: string, v: unknown) => (neqs.push([c, v]), b),
    order: () => b,
    limit: (n: number) => ((limitN = n), b),
    insert: (values: Row) => {
      op = 'insert'
      state.inserts.push({ table, values })
      return b
    },
    update: (values: Row) => {
      op = 'update'
      state.updates.push({ table, values })
      return b
    },
    upsert: () => ((op = 'upsert'), b),
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(result()).then(res, rej),
  }
  return b
}

const admin = {
  from: (t: string) => builder(t),
  auth: {
    admin: {
      updateUserById: (id: string, attrs: Row) => {
        state.metaUpdates.push({ id, attrs })
        return Promise.resolve({ error: state.metaError })
      },
      getUserById: () => Promise.resolve({ data: { user: null } }),
    },
  },
}

vi.mock('@/lib/supabase/api-auth', () => ({ getApiUser: () => Promise.resolve(state.user) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/billing/plan-limits', () => ({
  getTenantPlanLimits: () => Promise.resolve({ limits: { max_students: state.maxStudents } }),
  countTenantUsage: () => Promise.resolve({ students: state.students, courses: 0 }),
}))
vi.mock('@/lib/billing/access-cutoff', () => ({ reconcileAccessCutoffSafely: () => Promise.resolve() }))
vi.mock('@/lib/analytics/server', () => ({ track: () => Promise.resolve() }))
vi.mock('@/lib/email/send', () => ({ sendEmail: () => Promise.resolve(false) }))
vi.mock('@/lib/themes/school-brand', () => ({ getSchoolBrand: () => Promise.resolve({ name: 'X' }) }))

import { POST } from '@/app/api/tenant/switch/route'
import { GET } from '@/app/api/tenant/memberships/route'

const X = { id: '00000000-0000-0000-0000-000000000845', slug: 'x-school', name: 'X School', status: 'active' }
const OTHER = 'tenant-other'

function post(body: unknown) {
  return POST(new Request('http://t/api/tenant/switch', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  state.user = { id: 'user-1', email: 'Stu@Example.com', app_metadata: { tenant_id: 'tenant-old' } }
  state.tenants = [X]
  state.memberships = []
  state.invitations = []
  state.maxStudents = -1
  state.students = 0
  state.insertError = null
  state.metaUpdates = []
  state.metaError = null
  state.inserts = []
  state.updates = []
})

describe('POST /api/tenant/switch', () => {
  it('401s without a user', async () => {
    state.user = null
    expect((await post({ slug: 'x-school' })).status).toBe(401)
  })

  it('400s unless exactly one of tenantId or slug is given', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ tenantId: X.id, slug: 'x-school' })).status).toBe(400)
    expect((await post({ tenantId: 'not-a-uuid' })).status).toBe(400)
  })

  it('404s an unknown or inactive school', async () => {
    const res = await post({ slug: 'nope' })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('school_not_found')
    state.tenants = [{ ...X, status: 'suspended' }]
    expect((await post({ tenantId: X.id })).status).toBe(404)
    expect(state.metaUpdates).toEqual([])
  })

  it('switches a member without spending a seat', async () => {
    state.memberships = [{ user_id: 'user-1', tenant_id: X.id, role: 'teacher', status: 'active' }]
    const res = await post({ slug: 'X-School ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tenantId: X.id, slug: 'x-school', name: 'X School', role: 'teacher', joined: false })
    expect(state.inserts).toEqual([])
    expect(state.metaUpdates).toEqual([
      { id: 'user-1', attrs: { app_metadata: { tenant_id: X.id }, user_metadata: { preferred_tenant_id: X.id } } },
    ])
  })

  it('joins a member of nothing without asking', async () => {
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ tenantId: X.id, role: 'student', joined: true })
    expect(state.inserts).toEqual([
      { table: 'tenant_users', values: { tenant_id: X.id, user_id: 'user-1', role: 'student', status: 'active' } },
    ])
    expect(state.metaUpdates).toHaveLength(1)
  })

  it('asks a member of another school before spending a seat', async () => {
    state.memberships = [{ user_id: 'user-1', tenant_id: OTHER, role: 'student', status: 'active' }]
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'join_required', school: { tenantId: X.id, slug: 'x-school' } })
    expect(state.inserts).toEqual([])
    expect(state.metaUpdates).toEqual([])
  })

  it('joins a member of another school once they confirm', async () => {
    state.memberships = [{ user_id: 'user-1', tenant_id: OTHER, role: 'student', status: 'active' }]
    const res = await post({ tenantId: X.id, join: true })
    expect(res.status).toBe(200)
    expect((await res.json()).joined).toBe(true)
  })

  it('joins without asking when the school invited them, in the invited role', async () => {
    state.memberships = [{ user_id: 'user-1', tenant_id: OTHER, role: 'student', status: 'active' }]
    state.invitations = [{ id: 9, tenant_id: X.id, email: 'stu@example.com', status: 'pending', role: 'teacher' }]
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ role: 'teacher', joined: true })
  })

  it('reinstates a removed member instead of inserting a second row', async () => {
    state.memberships = [{ user_id: 'user-1', tenant_id: X.id, role: 'admin', status: 'removed' }]
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(200)
    expect((await res.json()).role).toBe('student')
    expect(state.inserts).toEqual([])
    expect(state.updates).toContainEqual({ table: 'tenant_users', values: { role: 'student', status: 'active' } })
  })

  it('refuses at the student cap before writing anything', async () => {
    state.maxStudents = 3
    state.students = 3
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'student_limit', school: { tenantId: X.id } })
    expect(state.inserts).toEqual([])
    expect(state.metaUpdates).toEqual([])
  })

  it('maps the LM001 trigger winning the race to student_limit', async () => {
    state.insertError = { code: 'LM001', message: 'plan_limit_exceeded:students' }
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('student_limit')
    expect(state.metaUpdates).toEqual([])
  })

  it('500s when the claim cannot be set', async () => {
    state.memberships = [{ user_id: 'user-1', tenant_id: X.id, role: 'student', status: 'active' }]
    state.metaError = { message: 'boom' }
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('switch_failed')
  })
})

describe('GET /api/tenant/memberships', () => {
  it('401s without a user', async () => {
    state.user = null
    expect((await GET(new Request('http://t/api/tenant/memberships'))).status).toBe(401)
  })

  it('lists active memberships and the active tenant', async () => {
    state.memberships = [
      { user_id: 'user-1', tenant_id: X.id, role: 'student', status: 'active', tenants: { slug: 'x-school', name: 'X School' } },
      { user_id: 'user-1', tenant_id: OTHER, role: 'student', status: 'removed', tenants: { slug: 'o', name: 'O' } },
      { user_id: 'user-2', tenant_id: OTHER, role: 'admin', status: 'active', tenants: { slug: 'o', name: 'O' } },
    ]
    const res = await GET(new Request('http://t/api/tenant/memberships'))
    expect(await res.json()).toEqual({
      memberships: [{ tenantId: X.id, slug: 'x-school', name: 'X School', role: 'student' }],
      activeTenantId: 'tenant-old',
    })
  })
})
