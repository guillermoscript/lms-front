import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email/send', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/lib/themes/school-brand', () => ({ getSchoolBrand: async () => ({ name: 'Acme' }) }))
vi.mock('@/lib/platform/tenant-site-url', () => ({
  getTenantSiteUrl: async (slug: string) => `https://${slug}.example.test`,
}))
vi.mock('@/lib/email/templates/invitation', () => ({
  invitationTemplate: (d: unknown) => ({ subject: 's', html: JSON.stringify(d) }),
}))

import { issueInvitation } from '@/lib/tenant/invitations'

function fakeAdmin({ pending = false, insertError = null as unknown } = {}) {
  const inserts: unknown[] = []
  const updates: { values: unknown; filters: unknown[][] }[] = []
  const from = (table: string) => {
    let isInsert = false
    let isUpdate = false
    const filters: unknown[][] = []
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = (...a: unknown[]) => (filters.push(a), b)
    b.insert = (v: unknown) => ((isInsert = true), inserts.push(v), b)
    b.update = (v: unknown) => ((isUpdate = true), updates.push({ values: v, filters }), b)
    const done = () => {
      if (isInsert) return { error: insertError }
      if (isUpdate) return { error: null }
      if (table === 'tenant_invitations') return { data: pending ? { id: 'i1' } : null }
      if (table === 'tenants') return { data: { name: 'Acme', slug: 'acme' } }
      return { data: { full_name: 'Root' } }
    }
    b.single = async () => done()
    b.maybeSingle = async () => done()
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(done()).then(r)
    return b
  }
  return { admin: { from } as never, inserts, updates }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const TOKEN = /^[0-9a-f]{64}$/

describe('issueInvitation', () => {
  it('inserts an admin invitation with a secret token + 14-day expiry and links to it', async () => {
    mocks.sendEmail.mockResolvedValue(true)
    const { admin, inserts } = fakeAdmin()
    const before = Date.now()
    const r = await issueInvitation({
      admin, tenantId: 't1', email: 'A@B.com', role: 'admin', invitedBy: 'u1', sendEmailInvite: true,
    })
    const row = inserts[0] as { token: string; expires_at: string }
    expect(inserts[0]).toMatchObject({ tenant_id: 't1', email: 'a@b.com', role: 'admin', invited_by: 'u1' })
    expect(row.token).toMatch(TOKEN)
    const ttl = new Date(row.expires_at).getTime() - before
    expect(ttl).toBeGreaterThan(14 * 86_400_000 - 60_000)
    expect(ttl).toBeLessThan(14 * 86_400_000 + 60_000)
    expect(r).toEqual({ ok: true, emailSent: true, joinUrl: `https://acme.example.test/join-school?invite=${row.token}` })
    // The emailed link carries the token too.
    expect(mocks.sendEmail.mock.calls[0][0].html).toContain(`invite=${row.token}`)
    expect(mocks.sendEmail.mock.calls[0][0].html).toContain('"role":"admin"')
  })

  it('every invitation gets its own token', async () => {
    const a = fakeAdmin()
    const b = fakeAdmin()
    const args = { tenantId: 't1', email: 'a@b.com', role: 'teacher' as const, invitedBy: 'u1', sendEmailInvite: false }
    await issueInvitation({ admin: a.admin, ...args })
    await issueInvitation({ admin: b.admin, ...args })
    expect((a.inserts[0] as { token: string }).token).not.toBe((b.inserts[0] as { token: string }).token)
  })

  it('a failed email still yields ok with the tokenised link', async () => {
    mocks.sendEmail.mockResolvedValue(false)
    const r = await issueInvitation({
      admin: fakeAdmin().admin, tenantId: 't1', email: 'a@b.com', role: 'student', invitedBy: 'u1', sendEmailInvite: true,
    })
    expect(r).toMatchObject({ ok: true, emailSent: false, joinUrl: expect.stringMatching(/\/join-school\?invite=[0-9a-f]{64}$/) })
  })

  it('does not email when not asked', async () => {
    const ok = await issueInvitation({
      admin: fakeAdmin().admin, tenantId: 't1', email: 'a@b.com', role: 'teacher', invitedBy: 'u1', sendEmailInvite: false,
    })
    expect(ok.emailSent).toBe(false)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('re-inviting a pending address ROTATES token and expiry instead of refusing', async () => {
    const { admin, inserts, updates } = fakeAdmin({ pending: true })
    const r = await issueInvitation({
      admin, tenantId: 't1', email: 'a@b.com', role: 'admin', invitedBy: 'u2', sendEmailInvite: false,
    })
    expect(inserts).toHaveLength(0)
    expect(updates).toHaveLength(1)
    const v = updates[0].values as { token: string; expires_at: string; role: string; invited_by: string }
    expect(v).toMatchObject({ role: 'admin', invited_by: 'u2' })
    expect(v.token).toMatch(TOKEN)
    expect(updates[0].filters).toEqual(expect.arrayContaining([['id', 'i1'], ['tenant_id', 't1'], ['status', 'pending']]))
    expect(r).toMatchObject({ ok: true, joinUrl: `https://acme.example.test/join-school?invite=${v.token}` })
  })

  it('reports a write failure without a link', async () => {
    const r = await issueInvitation({
      admin: fakeAdmin({ insertError: { code: '23505' } }).admin, tenantId: 't1', email: 'a@b.com',
      role: 'student', invitedBy: 'u1', sendEmailInvite: false,
    })
    expect(r).toEqual({ ok: false, error: 'Failed to create invitation', emailSent: false, joinUrl: '' })
  })
})
