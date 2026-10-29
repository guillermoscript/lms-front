import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const T = 'tenant-a'
const h = vi.hoisted(() => ({
  auth: null as null | { user: { id: string }; tenantId: string },
  membership: null as null | { role: string },
  tenant: { slug: 'acme', domain: null } as { slug: string; domain: string | null } | null,
  core: { set: vi.fn(), create: vi.fn(), deactivate: vi.fn() },
  gotToken: '',
}))

vi.mock('@/lib/supabase/api-auth', () => ({
  getBearerContext: async (t: string) => ((h.gotToken = t), h.auth),
}))
vi.mock('@/lib/plans/server', () => ({ hasPlanFeature: async () => true }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = () => c
      c.maybeSingle = async () => ({ data: table === 'tenants' ? h.tenant : h.membership })
      return c
    },
  }),
}))
vi.mock('@/lib/challenges/links', () => ({
  CHALLENGE_PUBLIC_WARNING: 'public!',
  setChallengeableCore: (...a: unknown[]) => h.core.set(...a),
  createLinkCore: (...a: unknown[]) => h.core.create(...a),
  deactivateLinkCore: (...a: unknown[]) => h.core.deactivate(...a),
}))

import { POST } from '@/app/api/challenges/manage/route'

const call = (body: unknown, auth: string | null = 'Bearer jwt') =>
  POST(
    new Request('http://x/api/challenges/manage', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN = 'lvh.me:3000'
  h.auth = { user: { id: 'u1' }, tenantId: T }
  h.membership = { role: 'teacher' }
  h.tenant = { slug: 'acme', domain: null }
})

describe('POST /api/challenges/manage', () => {
  it('401 without a verified bearer token', async () => {
    expect((await call({ action: 'create_link' }, null)).status).toBe(401)
    h.auth = null
    expect((await call({ action: 'create_link' })).status).toBe(401)
    expect(h.gotToken).toBe('jwt')
  })

  it('403 when the caller is not an active member of the resolved tenant', async () => {
    h.membership = null
    expect((await call({ action: 'create_link', exerciseId: 5 })).status).toBe(403)
    expect(h.core.create).not.toHaveBeenCalled()
  })

  it('uses the tenant and role resolved server-side (claim or membership fallback), never the body', async () => {
    h.core.create.mockResolvedValue({ ok: true, data: { token: 'tok', id: 'l', withScore: false } })
    await call({ action: 'create_link', exerciseId: 5, tenantId: 'evil', role: 'admin' })
    expect(h.core.create.mock.calls[0][1]).toEqual({ tenantId: T, userId: 'u1', role: 'teacher' })
  })

  it('create_link returns the tenant-host url (http locally)', async () => {
    h.core.create.mockResolvedValue({ ok: true, data: { token: 'tok', id: 'l', withScore: false } })
    const body = await (await call({ action: 'create_link', exerciseId: 5 })).json()
    expect(body.url).toBe('http://acme.lvh.me:3000/reto/tok')
    h.tenant = { slug: 'acme', domain: 'Academia.Example.com' }
    expect((await (await call({ action: 'create_link', exerciseId: 5 })).json()).url).toBe('https://academia.example.com/reto/tok')
  })

  it('create_link fails clearly when no host can be built', async () => {
    h.core.create.mockResolvedValue({ ok: true, data: { token: 'tok' } })
    delete process.env.NEXT_PUBLIC_PLATFORM_DOMAIN
    h.tenant = { slug: 'acme', domain: null }
    expect((await call({ action: 'create_link', exerciseId: 5 })).status).toBe(500)
  })

  it('maps core errors: Unauthorized -> 403, others -> 422', async () => {
    h.core.create.mockResolvedValueOnce({ ok: false, error: 'Unauthorized' })
    expect((await call({ action: 'create_link', exerciseId: 5 })).status).toBe(403)
    h.core.set.mockResolvedValueOnce({ ok: false, error: 'Exercise not found' })
    expect((await call({ action: 'set_challengeable', exerciseId: 5, enabled: true })).status).toBe(422)
  })

  it('set_challengeable returns the warning only when enabling', async () => {
    h.core.set.mockResolvedValueOnce({ ok: true, data: { exerciseId: 5, isChallengeable: true } })
    expect((await (await call({ action: 'set_challengeable', exerciseId: 5, enabled: true })).json()).warning).toBe('public!')
    h.core.set.mockResolvedValueOnce({ ok: true, data: { exerciseId: 5, isChallengeable: false } })
    expect((await (await call({ action: 'set_challengeable', exerciseId: 5, enabled: false })).json()).warning).toBeNull()
  })

  it('deactivate_link: 404 unknown, 403 non-owner, 200 ok, 400 without token', async () => {
    h.core.deactivate.mockResolvedValueOnce({ ok: false, error: 'Link not found' })
    expect((await call({ action: 'deactivate_link', token: 'abcdef' })).status).toBe(404)
    h.core.deactivate.mockResolvedValueOnce({ ok: false, error: 'Unauthorized' })
    expect((await call({ action: 'deactivate_link', token: 'abcdef' })).status).toBe(403)
    h.core.deactivate.mockResolvedValueOnce({ ok: true, data: { id: 'l', token: 'abcdef' } })
    expect((await call({ action: 'deactivate_link', token: 'abcdef' })).status).toBe(200)
    expect((await call({ action: 'deactivate_link' })).status).toBe(400)
  })

  it('400 on invalid JSON and unknown action', async () => {
    expect((await call('{nope')).status).toBe(400)
    expect((await call({ action: 'nope' })).status).toBe(400)
  })
})
