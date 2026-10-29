import { beforeEach, describe, expect, it, vi } from 'vitest'

type Attempt = {
  tenant_id: string
  exercise_id: number
  ip_hash: string
  guest_token_hash: string | null
  user_id: string | null
  is_official: boolean
  created_at: string
}
type Pred = (r: Record<string, unknown>) => boolean

const state = {
  attempts: [] as Attempt[],
  settings: [] as { tenant_id: string; setting_key: string; setting_value: unknown }[],
  settingsError: false,
  attemptsError: false,
}

// Fake builder that really applies every filter, so a missing .eq('tenant_id')
// returns other tenants' rows and fails the tests.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const preds: Pred[] = []
      const rows = () =>
        (table === 'tenant_settings' ? state.settings : state.attempts) as unknown as Record<string, unknown>[]
      const run = () => {
        const failed = table === 'tenant_settings' ? state.settingsError : state.attemptsError
        if (failed) return { data: null, count: null, error: new Error('db down') }
        const out = rows().filter((r) => preds.every((p) => p(r)))
        return { data: out, count: out.length, error: null }
      }
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), q),
        not: (c: string, _op: string, v: unknown) => (preds.push((r) => r[c] !== v), q),
        is: (c: string, v: unknown) => (preds.push((r) => r[c] === v), q),
        gte: (c: string, v: string) => (preds.push((r) => (r[c] as string) >= v), q),
        maybeSingle: async () => {
          const res = run()
          return { data: res.data?.[0] ?? null, error: res.error }
        },
        then: (res: (v: unknown) => void) => res(run()),
      }
      return q
    },
  }),
}))

import {
  checkChallengeLimits,
  DEFAULT_GUEST_MONTHLY_CAP,
  SAFE_GUEST_MONTHLY_CAP,
  GUEST_HOURLY_CAP,
  BURST_PER_MINUTE,
  hashIp,
  monthStart,
} from '@/lib/challenges/limits'

let n = 0
let T = ''
beforeEach(() => {
  T = `tenant-${n++}` // pending/burst state is module-level: isolate per test
  Object.assign(state, { attempts: [], settings: [], settingsError: false, attemptsError: false })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const guest = (over: Record<string, unknown> = {}) => ({
  tenantId: T,
  exerciseId: 1,
  ipHash: `ip-${n++}`,
  guestTokenHash: `g-${n++}`,
  ...over,
})
const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  tenant_id: T,
  exercise_id: 1,
  ip_hash: 'x',
  guest_token_hash: 'other',
  user_id: null,
  is_official: false,
  created_at: new Date().toISOString(),
  ...over,
})
const seed = (k: number, over: Partial<Attempt> = {}) => {
  for (let i = 0; i < k; i++) state.attempts.push(attempt(over))
}
const setCap = (v: unknown) =>
  state.settings.push({ tenant_id: T, setting_key: 'challenges_guest_monthly_cap', setting_value: v })

describe('guest path', () => {
  it('ok and official when clean', async () => {
    expect(await checkChallengeLimits(guest())).toEqual({ status: 'ok', official: true })
  })

  it('missing or empty guest token is rate_limited', async () => {
    expect((await checkChallengeLimits(guest({ guestTokenHash: null }))).status).toBe('rate_limited')
    expect((await checkChallengeLimits(guest({ guestTokenHash: '' }))).status).toBe('rate_limited')
  })

  it('already has an official attempt: ok but official=false, never rate_limited', async () => {
    const g = guest()
    seed(1, { guest_token_hash: g.guestTokenHash, is_official: true })
    expect(await checkChallengeLimits(g)).toEqual({ status: 'ok', official: false })
  })

  it('official attempt on another exercise or tenant does not count', async () => {
    const g = guest()
    seed(1, { guest_token_hash: g.guestTokenHash, is_official: true, exercise_id: 2 })
    seed(1, { guest_token_hash: g.guestTokenHash, is_official: true, tenant_id: 'other-tenant' })
    expect(await checkChallengeLimits(g)).toEqual({ status: 'ok', official: true })
  })

  it('hourly IP cap boundary, ignoring other tenants, old rows and member rows', async () => {
    const g = guest()
    seed(GUEST_HOURLY_CAP, { ip_hash: g.ipHash, tenant_id: 'other-tenant' })
    seed(GUEST_HOURLY_CAP, { ip_hash: g.ipHash, created_at: new Date(Date.now() - 61 * 60_000).toISOString() })
    seed(GUEST_HOURLY_CAP, { ip_hash: g.ipHash, user_id: 'u1', guest_token_hash: null })
    seed(GUEST_HOURLY_CAP - 1, { ip_hash: g.ipHash })
    expect((await checkChallengeLimits(g)).status).toBe('ok')
    // the allowed call is now pending, so the next one hits the cap
    expect((await checkChallengeLimits({ ...g, guestTokenHash: 'fresh' })).status).toBe('rate_limited')
  })

  it('hourly device cap boundary', async () => {
    const g = guest()
    seed(GUEST_HOURLY_CAP - 1, { guest_token_hash: g.guestTokenHash })
    expect((await checkChallengeLimits(g)).status).toBe('ok')
    state.attempts = []
    seed(GUEST_HOURLY_CAP, { guest_token_hash: g.guestTokenHash })
    const g2 = { ...g, tenantId: T, guestTokenHash: g.guestTokenHash, ipHash: 'new-ip' }
    expect((await checkChallengeLimits(g2)).status).toBe('rate_limited')
  })

  it('pending count stops parallel overshoot on one instance', async () => {
    const g = guest()
    const results: string[] = []
    for (let i = 0; i < GUEST_HOURLY_CAP + 2; i++) results.push((await checkChallengeLimits(g)).status)
    expect(results.filter((s) => s === 'ok')).toHaveLength(GUEST_HOURLY_CAP)
  })
})

describe('monthly cap', () => {
  it('boundary uses the tenant setting, counting only this tenant\'s guest rows', async () => {
    setCap(10)
    seed(50, { tenant_id: 'other-tenant' })
    seed(50, { guest_token_hash: null, user_id: 'u1' })
    seed(9)
    expect((await checkChallengeLimits(guest())).status).toBe('ok')
    // 9 rows + 1 pending == cap
    expect((await checkChallengeLimits(guest())).status).toBe('paused')
  })

  it('ignores rows from a previous month', async () => {
    setCap(1)
    seed(5, { created_at: new Date(monthStart().getTime() - 86_400_000).toISOString() })
    expect((await checkChallengeLimits(guest())).status).toBe('ok')
  })

  it('missing setting uses the default', async () => {
    seed(DEFAULT_GUEST_MONTHLY_CAP - 1)
    expect((await checkChallengeLimits(guest())).status).toBe('ok')
    expect((await checkChallengeLimits(guest())).status).toBe('paused')
  })

  it.each([['garbage'], [-5], [1.5], [null], ['']])('malformed cap %j falls back to the low safe cap', async (v) => {
    setCap(v)
    seed(SAFE_GUEST_MONTHLY_CAP)
    expect((await checkChallengeLimits(guest())).status).toBe('paused')
  })

  it('cap 0 pauses; numeric string accepted', async () => {
    setCap(0)
    expect((await checkChallengeLimits(guest())).status).toBe('paused')
  })

  it('paused wins over the hourly limit', async () => {
    setCap(1)
    const g = guest()
    seed(1, { ip_hash: g.ipHash })
    expect((await checkChallengeLimits(g)).status).toBe('paused')
  })
})

describe('members', () => {
  const member = (over: Record<string, unknown> = {}) => ({
    tenantId: T, exerciseId: 1, ipHash: 'shared-nat', guestTokenHash: null, userId: 'u1', ...over,
  })

  it('skip the IP cap and the monthly cap', async () => {
    setCap(0)
    seed(GUEST_HOURLY_CAP * 3, { ip_hash: 'shared-nat' })
    expect(await checkChallengeLimits(member())).toEqual({ status: 'ok', official: true })
  })

  it('official=false when the user already has one', async () => {
    seed(1, { user_id: 'u1', guest_token_hash: null, is_official: true })
    expect(await checkChallengeLimits(member())).toEqual({ status: 'ok', official: false })
  })

  it('are capped per user per hour', async () => {
    seed(GUEST_HOURLY_CAP, { user_id: 'u1', guest_token_hash: null })
    expect((await checkChallengeLimits(member())).status).toBe('rate_limited')
  })
})

describe('burst limiter and failures', () => {
  it('trips after BURST_PER_MINUTE calls from one tenant+IP', async () => {
    // member path so the hourly cap does not trip first
    const m = { tenantId: T, exerciseId: 1, ipHash: 'ip', guestTokenHash: null, userId: 'burst' }
    let last = ''
    for (let k = 0; k <= BURST_PER_MINUTE; k++) last = (await checkChallengeLimits(m)).status
    expect(last).toBe('rate_limited')
  })

  it('fails closed (paused) when tenant_settings errors', async () => {
    state.settingsError = true
    expect((await checkChallengeLimits(guest())).status).toBe('paused')
  })

  it('fails closed (paused) when challenge_attempts errors', async () => {
    state.attemptsError = true
    expect((await checkChallengeLimits(guest())).status).toBe('paused')
  })
})

describe('hashIp', () => {
  it('is deterministic, hex, keyed by the secret, and hides the raw IP', () => {
    process.env.CHALLENGE_IP_HASH_SECRET = 'secret-a'
    const h = hashIp('203.0.113.9')
    expect(h).toBe(hashIp('203.0.113.9'))
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    process.env.CHALLENGE_IP_HASH_SECRET = 'secret-b'
    expect(hashIp('203.0.113.9')).not.toBe(h)
  })

  it('throws in production without the secret and ignores the service-role key', () => {
    delete process.env.CHALLENGE_IP_HASH_SECRET
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk'
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => hashIp('1.1.1.1')).toThrow(/CHALLENGE_IP_HASH_SECRET/)
    vi.unstubAllEnvs()
  })
})

describe('monthStart', () => {
  it('is the first instant of the UTC month', () => {
    expect(monthStart(new Date('2026-10-29T15:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })
})
