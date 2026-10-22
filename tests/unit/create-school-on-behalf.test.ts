import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  issueInvitation: vi.fn(),
  syncTenantPlan: vi.fn(),
  reconcile: vi.fn(),
  setActiveTenant: vi.fn(),
  isSuperAdmin: vi.fn(),
  getCurrentUserId: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/tenant/invitations', () => ({ issueInvitation: mocks.issueInvitation }))
vi.mock('@/lib/billing/sync-tenant-plan', () => ({ syncTenantPlan: mocks.syncTenantPlan }))
vi.mock('@/lib/billing/access-cutoff', () => ({ reconcileAccessCutoffSafely: mocks.reconcile }))
vi.mock('@/lib/tenant/join-school', () => ({ setActiveTenant: mocks.setActiveTenant }))
vi.mock('@/lib/platform/tenant-site-url', () => ({
  getTenantSiteUrl: async (slug: string) => `https://${slug}.example.test`,
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ isSuperAdmin: mocks.isSuperAdmin }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentUserId: mocks.getCurrentUserId }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { createSchoolOnBehalfCore } from '@/lib/tenant/create-school-on-behalf'
import { createSchoolOnBehalf } from '@/app/actions/platform/create-school-on-behalf'

type Row = Record<string, unknown>
const NOW = new Date('2026-10-20T12:00:00Z')
const ADMIN_ID = 'super-1'
const INVITE_URL = `https://acme.example.test/join-school?invite=${'ab'.repeat(32)}`

function makeAdmin(opts: {
  slugTaken?: boolean
  insertError?: { code: string; message: string }
  tenantUsersError?: { message: string }
  deleteError?: { message: string }
  users?: { id: string; email: string }[]
} = {}) {
  const calls: { table: string; op: string; values?: unknown; filter?: unknown }[] = []
  function from(table: string) {
    let op = 'select'
    let values: unknown
    const filters: unknown[] = []
    const b: Record<string, unknown> = {}
    const finish = () => {
      calls.push({ table, op, values, filter: filters.length ? filters : undefined })
      if (table === 'tenants' && op === 'insert') {
        return opts.insertError
          ? { data: null, error: opts.insertError }
          : { data: { id: 'tenant-1' }, error: null }
      }
      if (table === 'tenants' && op === 'select') {
        return { data: opts.slugTaken ? { id: 'other' } : null, error: null }
      }
      if (table === 'tenants' && op === 'delete') return { data: null, error: opts.deleteError ?? null }
      if (table === 'tenant_users' && op === 'insert') return { data: null, error: opts.tenantUsersError ?? null }
      return { data: null, error: null }
    }
    for (const m of ['select', 'insert', 'upsert', 'delete', 'update']) {
      b[m] = (v?: unknown) => {
        if (m !== 'select' || op === 'select') op = m
        if (m !== 'select') values = v
        return b
      }
    }
    for (const m of ['eq', 'ilike', 'limit']) b[m] = (...a: unknown[]) => (filters.push([m, ...a]), b)
    b.single = async () => finish()
    b.maybeSingle = async () => finish()
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(finish()).then(res, rej)
    return b
  }
  const admin = {
    from,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: opts.users ?? [] }, error: null }),
        getUserById: async () => ({ data: { user: { email: 'Boss@Example.com' } }, error: null }),
      },
    },
  }
  const callsTo = (table: string, op: string) => calls.filter((c) => c.table === table && c.op === op)
  return { admin: admin as never, calls, callsTo }
}

const base = {
  name: 'Acme Academy',
  slug: 'acme',
  country: 'mx',
  ownerEmail: 'Owner@Example.com',
  mode: 'comped',
  plan: 'enterprise',
  reason: 'friend of the platform',
}
const run = (admin: never, input: Record<string, unknown> = {}) =>
  createSchoolOnBehalfCore({ admin, superAdminId: ADMIN_ID, input: { ...base, ...input } as never, now: NOW })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.issueInvitation.mockResolvedValue({ ok: true, emailSent: true, joinUrl: INVITE_URL })
  mocks.syncTenantPlan.mockResolvedValue(undefined)
  mocks.reconcile.mockResolvedValue(undefined)
  mocks.setActiveTenant.mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('createSchoolOnBehalfCore validation', () => {
  it('returns field errors and touches nothing', async () => {
    const { admin, calls } = makeAdmin()
    const r = await run(admin, { name: 'x', slug: 'Bad Slug', ownerEmail: '', reason: '', comped_until: '2020-01-01' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(['comped_until', 'name', 'ownerEmail', 'reason', 'slug'])
    }
    expect(calls).toHaveLength(0)
  })

  it('requires ownerEmail for comped and paid, not for internal', async () => {
    const { admin } = makeAdmin()
    const comped = await run(admin, { ownerEmail: null })
    expect(!comped.ok && comped.errors.ownerEmail).toBeTruthy()
    const bad = await run(admin, { ownerEmail: 'nope' })
    expect(!bad.ok && bad.errors.ownerEmail).toBeTruthy()
    const paid = await run(admin, { mode: 'paid', ownerEmail: '' })
    expect(!paid.ok && paid.errors.ownerEmail).toBeTruthy()
    const internal = await run(admin, { mode: 'internal', ownerEmail: null })
    expect(internal.ok).toBe(true)
  })

  it('rejects bad country and currency codes', async () => {
    const { admin } = makeAdmin()
    const r = await run(admin, { country: 'MEX', currency: 'PESO' })
    expect(!r.ok && r.errors.country && r.errors.currency).toBeTruthy()
  })

  it('rejects an unknown mode', async () => {
    const { admin } = makeAdmin()
    const r = await run(admin, { mode: 'free' })
    expect(!r.ok && r.errors.mode).toBeTruthy()
  })
})

describe('createSchoolOnBehalfCore', () => {
  it('duplicate slug: clear error, nothing inserted', async () => {
    const { admin, callsTo } = makeAdmin({ slugTaken: true })
    const r = await run(admin)
    expect(r).toMatchObject({ ok: false, errors: { slug: expect.stringMatching(/taken/i) } })
    expect(callsTo('tenants', 'insert')).toHaveLength(0)
  })

  it('maps a 23505 on insert (race) to the same slug error', async () => {
    const { admin } = makeAdmin({ insertError: { code: '23505', message: 'dup' } })
    const r = await run(admin)
    expect(r).toMatchObject({ ok: false, errors: { slug: expect.stringMatching(/taken/i) } })
  })

  it('internal: super admin is the owner, school written in billing mode', async () => {
    const { admin, callsTo } = makeAdmin()
    const r = await run(admin, { mode: 'internal', ownerEmail: 'ignored@example.com' })
    expect(r).toMatchObject({
      ok: true,
      tenantId: 'tenant-1',
      slug: 'acme',
      siteUrl: 'https://acme.example.test',
      owner: { kind: 'self', email: 'boss@example.com' },
    })
    const tenant = callsTo('tenants', 'insert')[0].values as Row
    expect(tenant).toMatchObject({
      billing_mode: 'internal',
      comped_by: ADMIN_ID,
      comped_reason: 'friend of the platform',
      fee_percent_override: null,
      country: 'MX',
      status: 'active',
    })
    expect(callsTo('tenant_users', 'insert')[0].values).toMatchObject({
      tenant_id: 'tenant-1',
      user_id: ADMIN_ID,
      role: 'admin',
      status: 'active',
    })
    expect(mocks.syncTenantPlan).toHaveBeenCalledWith(admin, 'tenant-1', 'enterprise', NOW.toISOString())
    expect(mocks.setActiveTenant).toHaveBeenCalledWith(admin, ADMIN_ID, 'tenant-1')
    expect(mocks.issueInvitation).not.toHaveBeenCalled()
    const settings = callsTo('tenant_settings', 'upsert')[0].values as Row[]
    expect(settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ setting_key: 'site_name', setting_value: { value: 'Acme Academy' } }),
        expect.objectContaining({ setting_key: 'currency', setting_value: { value: 'MXN' } }),
      ]),
    )
  })

  it('paid keeps comped fields null and does not sync a plan', async () => {
    const { admin, callsTo } = makeAdmin({ users: [{ id: 'u-9', email: 'owner@example.com' }] })
    const r = await run(admin, { mode: 'paid', plan: 'pro', reason: 'x' })
    expect(r.ok).toBe(true)
    expect(callsTo('tenants', 'insert')[0].values).toMatchObject({
      billing_mode: 'paid',
      comped_by: null,
      comped_reason: null,
      comped_at: null,
      comped_until: null,
      fee_percent_override: null,
    })
    expect(mocks.syncTenantPlan).not.toHaveBeenCalled()
  })

  it('existing user: added as admin, active school untouched', async () => {
    const { admin, callsTo } = makeAdmin({ users: [{ id: 'u-9', email: 'OWNER@example.com' }] })
    const r = await run(admin)
    expect(r).toMatchObject({ ok: true, owner: { kind: 'member_added', email: 'owner@example.com' } })
    expect(callsTo('tenant_users', 'insert')[0].values).toMatchObject({ user_id: 'u-9', role: 'admin', status: 'active' })
    expect(mocks.setActiveTenant).not.toHaveBeenCalled()
    expect(mocks.issueInvitation).not.toHaveBeenCalled()
    expect(callsTo('tenants', 'insert')[0].values).toMatchObject({ billing_mode: 'comped', fee_percent_override: 0 })
  })

  it('unknown email: invited as admin, link returned even if the email did not send', async () => {
    mocks.issueInvitation.mockResolvedValue({ ok: true, emailSent: false, joinUrl: INVITE_URL })
    const { admin } = makeAdmin()
    const r = await run(admin)
    expect(r).toMatchObject({
      ok: true,
      owner: {
        kind: 'invited',
        email: 'owner@example.com',
        emailSent: false,
        joinUrl: INVITE_URL,
      },
    })
    expect(mocks.issueInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', email: 'owner@example.com', role: 'admin', invitedBy: ADMIN_ID }),
    )
  })

  it('forced invitation failure: tenant is deleted and result is ok:false', async () => {
    mocks.issueInvitation.mockResolvedValue({ ok: false, error: 'Failed to create invitation', emailSent: false, joinUrl: '' })
    const { admin, callsTo } = makeAdmin()
    const r = await run(admin)
    expect(r).toMatchObject({ ok: false, error: 'Failed to create invitation' })
    const del = callsTo('tenants', 'delete')
    expect(del).toHaveLength(1)
    expect(del[0].filter).toEqual([['eq', 'id', 'tenant-1']])
  })

  it('forced membership failure: tenant is deleted', async () => {
    const { admin, callsTo } = makeAdmin({
      users: [{ id: 'u-9', email: 'owner@example.com' }],
      tenantUsersError: { message: 'boom' },
    })
    const r = await run(admin)
    expect(r.ok).toBe(false)
    expect(callsTo('tenants', 'delete')).toHaveLength(1)
  })

  it('plan sync failure rolls back too', async () => {
    mocks.syncTenantPlan.mockRejectedValue(new Error('Plan not found'))
    const { admin, callsTo } = makeAdmin()
    const r = await run(admin)
    expect(r).toMatchObject({ ok: false, error: 'Plan not found' })
    expect(callsTo('tenants', 'delete')).toHaveLength(1)
    expect(mocks.issueInvitation).not.toHaveBeenCalled()
  })

  it('a failed rollback is reported, never swallowed into success', async () => {
    mocks.issueInvitation.mockResolvedValue({ ok: false, error: 'nope', emailSent: false, joinUrl: '' })
    const { admin } = makeAdmin({ deleteError: { message: 'cannot delete' } })
    const r = await run(admin)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/rollback failed.*tenant-1/)
  })
})

describe('createSchoolOnBehalf action', () => {
  it('refuses a non-super-admin without touching the admin client', async () => {
    mocks.getCurrentUserId.mockResolvedValue('user-1')
    mocks.isSuperAdmin.mockResolvedValue(false)
    const r = await createSchoolOnBehalf({ ...base })
    expect(r).toEqual({ ok: false, errors: {}, error: 'Super admin only' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('refuses an anonymous caller', async () => {
    mocks.getCurrentUserId.mockResolvedValue(null)
    const r = await createSchoolOnBehalf({ ...base })
    expect(r).toEqual({ ok: false, errors: {}, error: 'Super admin only' })
    expect(mocks.isSuperAdmin).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('super admin: runs the core and revalidates the tenants list', async () => {
    mocks.getCurrentUserId.mockResolvedValue(ADMIN_ID)
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.createAdminClient.mockReturnValue(makeAdmin({ users: [{ id: 'u-9', email: 'owner@example.com' }] }).admin)
    const r = await createSchoolOnBehalf({ ...base })
    expect(r.ok).toBe(true)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/platform/tenants')
  })
})
