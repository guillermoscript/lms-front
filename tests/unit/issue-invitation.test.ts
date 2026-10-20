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
  const from = (table: string) => {
    let isInsert = false
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = () => b
    b.insert = (v: unknown) => ((isInsert = true), inserts.push(v), b)
    const done = () => {
      if (isInsert) return { error: insertError }
      if (table === 'tenant_invitations') return { data: pending ? { id: 'i1' } : null }
      if (table === 'tenants') return { data: { name: 'Acme', slug: 'acme' } }
      return { data: { full_name: 'Root' } }
    }
    b.single = async () => done()
    b.maybeSingle = async () => done()
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(done()).then(r)
    return b
  }
  return { admin: { from } as never, inserts }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('issueInvitation', () => {
  it('inserts an admin invitation and reports the email result', async () => {
    mocks.sendEmail.mockResolvedValue(true)
    const { admin, inserts } = fakeAdmin()
    const r = await issueInvitation({
      admin, tenantId: 't1', email: 'A@B.com', role: 'admin', invitedBy: 'u1', sendEmailInvite: true,
    })
    expect(r).toEqual({ ok: true, emailSent: true, joinUrl: 'https://acme.example.test/join-school' })
    expect(inserts[0]).toEqual({ tenant_id: 't1', email: 'a@b.com', role: 'admin', invited_by: 'u1' })
    expect(mocks.sendEmail.mock.calls[0][0].html).toContain('"role":"admin"')
  })

  it('a failed email still yields ok with the link', async () => {
    mocks.sendEmail.mockResolvedValue(false)
    const r = await issueInvitation({
      admin: fakeAdmin().admin, tenantId: 't1', email: 'a@b.com', role: 'student', invitedBy: 'u1', sendEmailInvite: true,
    })
    expect(r).toMatchObject({ ok: true, emailSent: false, joinUrl: expect.stringContaining('/join-school') })
  })

  it('does not email when not asked, and refuses a duplicate pending invite', async () => {
    const ok = await issueInvitation({
      admin: fakeAdmin().admin, tenantId: 't1', email: 'a@b.com', role: 'teacher', invitedBy: 'u1', sendEmailInvite: false,
    })
    expect(ok.emailSent).toBe(false)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    const dup = await issueInvitation({
      admin: fakeAdmin({ pending: true }).admin, tenantId: 't1', email: 'a@b.com', role: 'teacher', invitedBy: 'u1', sendEmailInvite: false,
    })
    expect(dup).toMatchObject({ ok: false, error: 'An invitation is already pending for this email' })
  })
})
