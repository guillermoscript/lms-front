/**
 * `POST /api/tenant/switch` + `GET /api/tenant/memberships` (#845) and the
 * seat rules in `lib/tenant/join-school`.
 *
 * What is proven: a member is switched without a seat being spent; a
 * non-member is joined only where the web joins without asking or after an
 * explicit `join: true`; the plan's student cap — pre-check or the `LM001`
 * trigger winning a race — comes back as a 409 `student_limit`; and every
 * refusal leaves `app_metadata` alone. #859: a DB failure is a 500, never a
 * 404 or a join; the race fallback never claims "already a member" in a 500;
 * and a suspended school is neither listed nor switchable.
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
  /** Tables whose reads fail, as a DB outage would. */
  readErrors: {} as Record<string, { message: string }>,
  /** A concurrent join landing: `tenant_users` reads after the first see these rows. */
  racedMemberships: null as Row[] | null,
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
  // `embed.col` filters apply to the embedded row, as PostgREST's `!inner` does.
  const matches = (r: Row, c: string, v: unknown) => {
    if (!c.includes('.')) return r[c] === v
    const [embed, col] = c.split('.')
    return (r[embed] as Row | undefined)?.[col] === v
  }
  const rows = () =>
    source()
      .filter((r) => eqs.every(([c, v]) => matches(r, c, v)))
      .filter((r) => neqs.every(([c, v]) => r[c] !== v))
      .slice(0, limitN)
  const readError = () => state.readErrors[table] ?? null
  const result = () => {
    if (op === 'insert') {
      return { data: null, error: state.insertError }
    }
    if (op !== 'select') return { data: null, error: null }
    return readError() ? { data: null, error: readError() } : { data: rows(), error: null }
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
    maybeSingle: () => {
      const answer = readError() ? { data: null, error: readError() } : { data: rows()[0] ?? null, error: null }
      if (table === 'tenant_users' && state.racedMemberships) {
        state.memberships = state.racedMemberships
        state.racedMemberships = null
      }
      return Promise.resolve(answer)
    },
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

vi.mock('@/lib/supabase/api-auth', () => ({ getBearerUser: () => Promise.resolve(state.user) }))
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
  state.readErrors = {}
  state.racedMemberships = null
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

  it('500s, not 404s, when the school lookup fails', async () => {
    state.readErrors = { tenants: { message: 'connection reset' } }
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('switch_failed')
    expect(state.metaUpdates).toEqual([])
  })

  it('500s without joining when the membership lookup fails', async () => {
    state.readErrors = { tenant_users: { message: 'connection reset' } }
    const res = await post({ tenantId: X.id, join: true })
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('switch_failed')
    expect(state.inserts).toEqual([])
    expect(state.metaUpdates).toEqual([])
  })

  it('404s a member of a suspended school without touching the claim', async () => {
    state.tenants = [{ ...X, status: 'suspended' }]
    state.memberships = [{ user_id: 'user-1', tenant_id: X.id, role: 'admin', status: 'active' }]
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('school_not_found')
    expect(state.metaUpdates).toEqual([])
  })

  it('switches when a concurrent request joined first', async () => {
    // The route's read saw no membership; joinSchool's sees the concurrent one.
    state.racedMemberships = [{ user_id: 'user-1', tenant_id: X.id, role: 'student', status: 'active' }]
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ tenantId: X.id, role: 'student', joined: false })
  })

  it('answers a failed race fallback with a generic error, not "already a member"', async () => {
    state.racedMemberships = [{ user_id: 'user-1', tenant_id: X.id, role: 'student', status: 'active' }]
    state.metaError = { message: 'boom' }
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('switch_failed')
    expect(body.error).not.toMatch(/already a member/i)
  })

  it('500s when the claim cannot be set', async () => {
    state.memberships = [{ user_id: 'user-1', tenant_id: X.id, role: 'student', status: 'active' }]
    state.metaError = { message: 'boom' }
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('switch_failed')
  })
})

describe('bans (#892)', () => {
  const banned = () => [{ user_id: 'user-1', tenant_id: X.id, role: 'student', status: 'banned' }]

  it('403s a banned user without being asked to confirm, and changes nothing', async () => {
    state.memberships = banned()
    state.invitations = [{ id: 9, tenant_id: X.id, email: 'stu@example.com', status: 'pending', role: 'teacher' }]
    const res = await post({ tenantId: X.id })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'banned', school: { tenantId: X.id } })
    expect(state.inserts).toEqual([])
    expect(state.updates).toEqual([])
    expect(state.metaUpdates).toEqual([])
  })

  it('still refuses with join: true, even holding a pending invitation', async () => {
    state.memberships = banned()
    state.invitations = [{ id: 9, tenant_id: X.id, email: 'stu@example.com', status: 'pending', role: 'teacher' }]
    const res = await post({ tenantId: X.id, join: true })
    expect(res.status).toBe(403)
    expect(state.updates).toEqual([])
    expect(state.metaUpdates).toEqual([])
  })

  it('joinSchool refuses a banned row before the seat check or the invitation', async () => {
    const { joinSchool, BANNED_MESSAGE } = await import('@/lib/tenant/join-school')
    state.memberships = banned()
    state.invitations = [{ id: 9, tenant_id: X.id, email: 'stu@example.com', status: 'pending', role: 'teacher' }]
    const out = await joinSchool({
      admin: admin as never,
      user: { id: 'user-1', email: 'Stu@Example.com' },
      tenantId: X.id,
    })
    expect(out).toEqual({ ok: false, code: 'banned', error: BANNED_MESSAGE })
    expect(state.updates).toEqual([])
    expect(state.inserts).toEqual([])
  })

  it('maps the guard trigger (LM002) winning a race to banned', async () => {
    state.memberships = [{ user_id: 'user-1', tenant_id: X.id, role: 'student', status: 'removed' }]
    // The reinstating UPDATE is the write that hits the trigger.
    const real = admin.from
    admin.from = (t: string) => {
      const b = real(t) as Record<string, unknown>
      if (t === 'tenant_users') {
        const update = b.update as (v: Row) => unknown
        b.update = (v: Row) => {
          update(v)
          b.then = (res: (v: unknown) => void) =>
            Promise.resolve({ data: null, error: { code: 'LM002', message: 'tenant_banned' } }).then(res)
          return b
        }
      }
      return b
    }
    try {
      const res = await post({ tenantId: X.id, join: true })
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe('banned')
    } finally {
      admin.from = real
    }
  })
})

describe('GET /api/tenant/memberships', () => {
  it('401s without a user', async () => {
    state.user = null
    expect((await GET(new Request('http://t/api/tenant/memberships'))).status).toBe(401)
  })

  it('lists active memberships of active schools and the active tenant', async () => {
    state.memberships = [
      { user_id: 'user-1', tenant_id: X.id, role: 'student', status: 'active', tenants: { slug: 'x-school', name: 'X School', status: 'active' } },
      { user_id: 'user-1', tenant_id: OTHER, role: 'student', status: 'removed', tenants: { slug: 'o', name: 'O', status: 'active' } },
      { user_id: 'user-1', tenant_id: 'tenant-suspended', role: 'admin', status: 'active', tenants: { slug: 's', name: 'S', status: 'suspended' } },
      { user_id: 'user-2', tenant_id: OTHER, role: 'admin', status: 'active', tenants: { slug: 'o', name: 'O', status: 'active' } },
    ]
    const res = await GET(new Request('http://t/api/tenant/memberships'))
    expect(await res.json()).toEqual({
      memberships: [{ tenantId: X.id, slug: 'x-school', name: 'X School', role: 'student' }],
      activeTenantId: 'tenant-old',
    })
  })
})
