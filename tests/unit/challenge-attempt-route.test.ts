import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const T = 'tenant-a'
const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  membership: null as null | { status: string },
  cookie: undefined as string | undefined,
  submit: vi.fn(),
  eqs: [] as [string, unknown][],
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-tenant-id': T, 'x-forwarded-for': '1.2.3.4' }),
  cookies: async () => ({ get: () => (h.cookie ? { value: h.cookie } : undefined) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const c: Record<string, unknown> = {}
      c.select = () => c
      c.eq = (k: string, v: unknown) => (h.eqs.push([`${table}.${k}`, v]), c)
      c.maybeSingle = async () => ({ data: table === 'tenant_users' ? h.membership : null })
      return c
    },
  }),
}))
vi.mock('@/lib/ai/tenant-ai', () => ({ createTenantAi: () => ({ lastProviderId: () => 'p' }) }))
vi.mock('@/lib/exercises/ai-failure', () => ({ aiFailureResponse: async () => new Response('x', { status: 500 }) }))
vi.mock('@/lib/plans/server', () => ({ hasPlanFeature: async () => true }))
vi.mock('@/lib/challenges/grade', () => ({ gradeChallengeAnswer: vi.fn() }))
vi.mock('@/lib/challenges/attempt', () => ({
  MAX_ANSWER_CHARS: 20_000,
  submitChallengeAttempt: (...a: unknown[]) => h.submit(...a),
}))

import { POST } from '@/app/api/reto/attempt/route'
import { GUEST_COOKIE, newGuestToken } from '@/lib/challenges/identity'

const call = () =>
  POST(new Request('http://x/api/reto/attempt', { method: 'POST', body: JSON.stringify({ token: 'tok', answer: 'hi' }) }))
const identityUsed = () => h.submit.mock.calls[0][2] as { userId: string | null; guestTokenHash: string | null }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CHALLENGE_HASH_SECRET = 'test-secret'
  h.user = { id: 'u1' }
  h.membership = { status: 'active' }
  h.cookie = undefined
  h.eqs = []
  h.submit.mockResolvedValue({ ok: true, result: { isOfficial: true } })
})

describe('POST /api/reto/attempt identity', () => {
  it('active member plays as themself, no guest cookie issued', async () => {
    const res = await call()
    expect(identityUsed()).toMatchObject({ userId: 'u1', guestTokenHash: null })
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(h.eqs).toContainEqual(['tenant_users.tenant_id', T])
  })

  it('signed-in NON-member plays as a guest with a fresh signed cookie (no userId)', async () => {
    h.membership = null
    const res = await call()
    const id = identityUsed()
    expect(id.userId).toBeNull()
    expect(id.guestTokenHash).toEqual(expect.any(String))
    expect(res.headers.get('set-cookie')).toContain(`${GUEST_COOKIE}=`)
  })

  it('signed-in non-member reuses a valid existing guest cookie', async () => {
    h.membership = null
    h.cookie = newGuestToken()
    const res = await call()
    expect(identityUsed().userId).toBeNull()
    expect(identityUsed().guestTokenHash).toEqual(expect.any(String))
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('banned user never plays as a member', async () => {
    h.membership = { status: 'banned' }
    await call()
    expect(identityUsed().userId).toBeNull()
    expect(identityUsed().guestTokenHash).toEqual(expect.any(String))
  })

  it('anonymous visitor stays a guest', async () => {
    h.user = null
    h.membership = null
    await call()
    expect(identityUsed()).toMatchObject({ userId: null })
  })
})
