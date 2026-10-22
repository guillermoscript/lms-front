import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email/send', () => ({ sendEmail: async () => false }))
vi.mock('@/lib/email/templates/joined-school', () => ({ joinedSchoolTemplate: () => ({}) }))
vi.mock('@/lib/themes/school-brand', () => ({ getSchoolBrand: async () => ({ name: 'Acme' }) }))
vi.mock('@/lib/billing/access-cutoff', () => ({ reconcileAccessCutoffSafely: async () => {} }))
vi.mock('@/lib/billing/plan-limits', () => ({
  getTenantPlanLimits: async () => ({ limits: { max_students: -1 } }),
  countTenantUsage: async () => ({ students: 0 }),
}))
vi.mock('@/lib/analytics/server', () => ({ track: async () => {} }))

import { joinSchool, canJoinWithoutAsking, hasValidInvitation } from '@/lib/tenant/join-school'

type Row = Record<string, unknown>
const TENANT = 'tenant-1'
const TOKEN = 'ab'.repeat(32)
const FUTURE = () => new Date(Date.now() + 86_400_000).toISOString()
const PAST = () => new Date(Date.now() - 86_400_000).toISOString()

/** In-memory tenant_invitations/tenant_users that honours eq/gt filters, so the claim semantics are real. */
function fakeAdmin(opts: { invitations: Row[]; memberInsertError?: { message: string }; memberships?: Row[] }) {
  const invitations = opts.invitations
  const members: Row[] = opts.memberships ?? []
  const inserted: Row[] = []
  function from(table: string) {
    let op = 'select'
    let values: Row = {}
    const filters: ((r: Row) => boolean)[] = []
    const b: Record<string, unknown> = {}
    const rows = () => (table === 'tenant_invitations' ? invitations : table === 'tenant_users' ? members : [])
    const run = () => {
      if (table === 'tenant_users' && op === 'insert') {
        if (opts.memberInsertError) return { data: null, error: opts.memberInsertError }
        inserted.push(values)
        return { data: null, error: null }
      }
      if (table === 'gamification_profiles') return { data: null, error: null }
      const matched = rows().filter((r) => filters.every((f) => f(r)))
      if (op === 'update') {
        // Atomic: a single call mutates only rows matching every predicate.
        matched.forEach((r) => Object.assign(r, values))
        return { data: matched.map((r) => ({ ...r })), error: null }
      }
      return { data: matched.map((r) => ({ ...r })), error: null }
    }
    for (const m of ['select', 'insert', 'update', 'upsert']) {
      b[m] = (v?: Row) => {
        if (m !== 'select') {
          op = m
          values = v ?? {}
        }
        return b
      }
    }
    b.eq = (k: string, v: unknown) => (filters.push((r) => r[k] === v), b)
    b.neq = (k: string, v: unknown) => (filters.push((r) => r[k] !== v), b)
    b.gt = (k: string, v: string) => (filters.push((r) => String(r[k]) > v), b)
    b.limit = () => b
    b.maybeSingle = async () => {
      const r = run()
      return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
    }
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej)
    return b
  }
  const admin = {
    from,
    auth: {
      admin: {
        updateUserById: async () => ({ error: null }),
        getUserById: async () => ({ data: { user: null } }),
      },
    },
  }
  return { admin: admin as never, invitations, inserted }
}

const invite = (over: Row = {}): Row => ({
  id: 'inv-1', tenant_id: TENANT, email: 'owner@example.com', role: 'admin', status: 'pending',
  token: TOKEN, expires_at: FUTURE(), ...over,
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('joinSchool invitation claim', () => {
  it('token + matching account email: takes the invited role (admin) and spends the invitation', async () => {
    const f = fakeAdmin({ invitations: [invite()] })
    const r = await joinSchool({
      admin: f.admin, user: { id: 'u1', email: 'Owner@Example.com' }, tenantId: TENANT, inviteToken: TOKEN,
    })
    expect(r).toMatchObject({ ok: true, role: 'admin' })
    expect(f.inserted[0]).toMatchObject({ user_id: 'u1', role: 'admin' })
    expect(f.invitations[0]).toMatchObject({ status: 'accepted' })
  })

  it('attacker who registered the invited admin email first, joining WITHOUT the token, is only a student', async () => {
    const f = fakeAdmin({ invitations: [invite()] })
    const r = await joinSchool({ admin: f.admin, user: { id: 'evil', email: 'owner@example.com' }, tenantId: TENANT })
    expect(r).toMatchObject({ ok: true, role: 'student' })
    expect(f.inserted[0]).toMatchObject({ role: 'student' })
    expect(f.invitations[0]).toMatchObject({ status: 'pending' })
  })

  it('a wrong or malformed token grants nothing', async () => {
    for (const bad of ['cd'.repeat(32), 'not-a-token', '', undefined]) {
      const f = fakeAdmin({ invitations: [invite()] })
      const r = await joinSchool({
        admin: f.admin, user: { id: 'evil', email: 'owner@example.com' }, tenantId: TENANT, inviteToken: bad,
      })
      expect(r).toMatchObject({ ok: true, role: 'student' })
      expect(f.invitations[0].status).toBe('pending')
    }
  })

  it('token + a DIFFERENT account email is not consumed (leaked link is useless)', async () => {
    const f = fakeAdmin({ invitations: [invite()] })
    const r = await joinSchool({
      admin: f.admin, user: { id: 'u2', email: 'someone-else@example.com' }, tenantId: TENANT, inviteToken: TOKEN,
    })
    expect(r).toMatchObject({ ok: true, role: 'student' })
    expect(f.invitations[0]).toMatchObject({ status: 'pending' })
  })

  it('an expired invitation, or another school\'s token, is not consumed', async () => {
    for (const row of [invite({ expires_at: PAST() }), invite({ tenant_id: 'other-tenant' })]) {
      const f = fakeAdmin({ invitations: [row] })
      const r = await joinSchool({
        admin: f.admin, user: { id: 'u1', email: 'owner@example.com' }, tenantId: TENANT, inviteToken: TOKEN,
      })
      expect(r).toMatchObject({ ok: true, role: 'student' })
      expect(row.status).toBe('pending')
    }
  })

  it('a token is single-use: the second joiner with the same email is a student', async () => {
    const f = fakeAdmin({ invitations: [invite()] })
    const a = await joinSchool({ admin: f.admin, user: { id: 'u1', email: 'owner@example.com' }, tenantId: TENANT, inviteToken: TOKEN })
    const b = await joinSchool({ admin: f.admin, user: { id: 'u3', email: 'owner@example.com' }, tenantId: TENANT, inviteToken: TOKEN })
    expect(a).toMatchObject({ role: 'admin' })
    expect(b).toMatchObject({ role: 'student' })
  })

  it('gives the invitation back when the membership write fails', async () => {
    const f = fakeAdmin({ invitations: [invite()], memberInsertError: { message: 'boom' } })
    const r = await joinSchool({
      admin: f.admin, user: { id: 'u1', email: 'owner@example.com' }, tenantId: TENANT, inviteToken: TOKEN,
    })
    expect(r).toMatchObject({ ok: false, code: 'failed' })
    expect(f.invitations[0]).toMatchObject({ status: 'pending', accepted_at: null })
  })
})

describe('hasValidInvitation / canJoinWithoutAsking', () => {
  it('requires token AND matching email AND unexpired', async () => {
    const user = { id: 'u1', email: 'owner@example.com' }
    const base = { user, tenantId: TENANT }
    expect(await hasValidInvitation({ admin: fakeAdmin({ invitations: [invite()] }).admin, ...base, inviteToken: TOKEN })).toBe(true)
    expect(await hasValidInvitation({ admin: fakeAdmin({ invitations: [invite()] }).admin, ...base })).toBe(false)
    expect(await hasValidInvitation({ admin: fakeAdmin({ invitations: [invite()] }).admin, ...base, inviteToken: 'cd'.repeat(32) })).toBe(false)
    expect(await hasValidInvitation({ admin: fakeAdmin({ invitations: [invite()] }).admin, user: { id: 'u', email: 'x@y.com' }, tenantId: TENANT, inviteToken: TOKEN })).toBe(false)
    expect(await hasValidInvitation({ admin: fakeAdmin({ invitations: [invite({ expires_at: PAST() })] }).admin, ...base, inviteToken: TOKEN })).toBe(false)
  })

  it('a member of another school is auto-joined only with a valid token', async () => {
    const memberships = [{ user_id: 'u1', tenant_id: 'elsewhere', status: 'active' }]
    const user = { id: 'u1', email: 'owner@example.com' }
    expect(await canJoinWithoutAsking({ admin: fakeAdmin({ invitations: [invite()], memberships }).admin, user, tenantId: TENANT })).toBe(false)
    expect(await canJoinWithoutAsking({ admin: fakeAdmin({ invitations: [invite()], memberships }).admin, user, tenantId: TENANT, inviteToken: TOKEN })).toBe(true)
  })
})
