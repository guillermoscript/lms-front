/**
 * Challenge claim (#1029): attaches a guest attempt to a user, never grants
 * paid access, is idempotent, and rejects banned users.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }))
const ctx = vi.hoisted(() => ({
  user: { id: 'u1', email: 'u@x.com' } as { id: string; email: string } | null,
  cookie: 'raw-guest-token' as string | undefined,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  rpcError: null as { message: string } | null,
  failTables: [] as string[],
  beforeUpdate: null as null | (() => void),
}))

function fakeAdmin() {
  return {
    from(table: string) {
      const rows = () => db.tables[table] ?? []
      const filters: Array<(r: Row) => boolean> = []
      let patch: Row | null = null
      let lim = Infinity
      let orderCol: string | null = null
      const run = () => {
        if (ctx.failTables.includes(table)) return { data: null, error: { message: 'boom' } }
        let out = rows().filter((r) => filters.every((f) => f(r)))
        if (orderCol) out = [...out].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])))
        if (ctx.failTables.includes(table)) return { data: null, error: { message: 'boom' } }
        if (patch) {
          ctx.beforeUpdate?.()
          const hit = rows().filter((r) => filters.every((f) => f(r)))
          hit.forEach((r) => Object.assign(r, patch))
          return { data: hit.map((r) => ({ id: r.id })), error: null }
        }
        return { data: out.slice(0, lim), error: null }
      }
      const b: Record<string, unknown> = {
        select: () => b,
        update: (p: Row) => ((patch = p), b),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
        neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
        gt: (c: string, v: number) => (filters.push((r) => (r[c] as number) > v), b),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
        order: (c: string) => ((orderCol = c), b),
        limit: (n: number) => ((lim = n), b),
        maybeSingle: () => {
          const res = run()
          return Promise.resolve({ data: (res.data as Row[] | null)?.[0] ?? null, error: null })
        },
        then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
      }
      return b
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => Promise.resolve('t1') }))
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: (n: string) => (n === 'challenge_guest' && ctx.cookie ? { value: ctx.cookie } : undefined) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: ctx.user } }) },
      rpc: (fn: string, args: unknown) => {
        ctx.rpcCalls.push({ fn, args })
        return Promise.resolve({ error: ctx.rpcError })
      },
    }),
}))
vi.mock('@/lib/tenant/join-school', () => ({ BANNED_MESSAGE: 'banned-msg' }))

import { claimChallenge } from '@/app/actions/challenge-claim'
import { hashGuestToken } from '@/lib/challenges/claim'

function seed(opts: { price?: number; planPrice?: number; membership?: string; ownOfficial?: boolean } = {}) {
  db.tables = {
    tenant_settings: [{ tenant_id: 't1', setting_key: 'challenges_enabled', setting_value: true }],
    tenant_users: [{ tenant_id: 't1', user_id: 'u1', status: opts.membership ?? 'active' }],
    challenge_links: [{ id: 'l1', tenant_id: 't1', exercise_id: 10, token: 'tok', active: true }],
    exercises: [
      { id: 10, course_id: 5, tenant_id: 't1', status: 'published', is_challengeable: true },
      { id: 11, course_id: 5, tenant_id: 't1', status: 'published' },
    ],
    product_courses: opts.price === undefined ? [] : [{ tenant_id: 't1', course_id: 5, product_id: 1 }],
    products: opts.price === undefined ? [] : [{ tenant_id: 't1', product_id: 1, price: opts.price }],
    plan_courses: opts.planPrice === undefined ? [] : [{ course_id: 5, plan_id: 2 }],
    plans: opts.planPrice === undefined ? [] : [{ tenant_id: 't1', plan_id: 2, price: opts.planPrice, deleted_at: null }],
    challenge_attempts: [
      {
        id: 'g1', tenant_id: 't1', exercise_id: 10, user_id: null, guest_token_hash: hashGuestToken('raw-guest-token'),
        is_official: true, score: 87, passed: true, created_at: '2026-10-29T10:00:00Z',
      },
      ...(opts.ownOfficial
        ? [{ id: 'm1', tenant_id: 't1', exercise_id: 10, user_id: 'u1', guest_token_hash: null, is_official: true, score: 60, passed: false, created_at: '2026-10-28T10:00:00Z' }]
        : []),
    ],
  }
}

const attempt = (id: string) => db.tables.challenge_attempts.find((r) => r.id === id)!

beforeEach(() => {
  ctx.user = { id: 'u1', email: 'u@x.com' }
  ctx.cookie = 'raw-guest-token'
  ctx.rpcCalls = []
  ctx.rpcError = null
  ctx.failTables = []
  ctx.beforeUpdate = null
})

describe('claimChallenge', () => {
  it('free course: claims the attempt, grants the free entitlement, links the next exercise', async () => {
    seed({ price: 0 })
    const out = await claimChallenge('tok')
    expect(out).toMatchObject({ success: true, score: 87, accessGranted: true, nextExerciseId: 11, requiresPurchase: false })
    expect(ctx.rpcCalls).toEqual([{ fn: 'grant_free_entitlement', args: { _user_id: 'u1', _course_id: 5 } }])
    expect(attempt('g1')).toMatchObject({ user_id: 'u1', is_official: true })
  })

  it('course with no product and no plan counts as free', async () => {
    seed()
    expect(await claimChallenge('tok')).toMatchObject({ success: true, accessGranted: true })
  })

  it('NEGATIVE: paid course (product price) never grants an entitlement', async () => {
    seed({ price: 49 })
    const out = await claimChallenge('tok')
    expect(out).toMatchObject({ success: true, score: 87, accessGranted: false, requiresPurchase: true, nextExerciseId: null })
    expect(ctx.rpcCalls).toEqual([])
    expect(attempt('g1').user_id).toBe('u1') // still claimed into the ranking
  })

  it('NEGATIVE: course sold only through a priced plan never grants an entitlement', async () => {
    seed({ planPrice: 10 })
    const out = await claimChallenge('tok')
    expect(out).toMatchObject({ success: true, accessGranted: false, requiresPurchase: true })
    expect(ctx.rpcCalls).toEqual([])
  })

  it('NEGATIVE: a priced product wins even when a free plan also includes the course', async () => {
    seed({ price: 5, planPrice: 0 })
    await claimChallenge('tok')
    expect(ctx.rpcCalls).toEqual([])
  })

  it('claiming twice is a no-op', async () => {
    seed({ price: 0 })
    await claimChallenge('tok')
    const snapshot = JSON.stringify(db.tables.challenge_attempts)
    const again = await claimChallenge('tok')
    expect(again).toMatchObject({ success: true, score: 87 })
    expect(JSON.stringify(db.tables.challenge_attempts)).toBe(snapshot)
    expect(db.tables.challenge_attempts).toHaveLength(1)
  })

  it('user already has an official attempt: the guest one becomes practice', async () => {
    seed({ price: 0, ownOfficial: true })
    const out = await claimChallenge('tok')
    expect(out).toMatchObject({ success: true, score: 60 })
    expect(attempt('g1')).toMatchObject({ user_id: 'u1', is_official: false })
    expect(attempt('m1').is_official).toBe(true)
  })

  it('banned user is rejected: nothing claimed, nothing granted', async () => {
    seed({ price: 0, membership: 'banned' })
    const out = await claimChallenge('tok')
    expect(out).toMatchObject({ success: false, code: 'banned' })
    expect(attempt('g1').user_id).toBeNull()
    expect(ctx.rpcCalls).toEqual([])
  })

  it('non-member is told to join first: nothing claimed, nothing granted', async () => {
    seed({ price: 0 })
    db.tables.tenant_users = []
    expect(await claimChallenge('tok')).toMatchObject({ success: false, code: 'not_member' })
    expect(attempt('g1').user_id).toBeNull()
    expect(ctx.rpcCalls).toEqual([])
  })

  it('requires a session, a cookie, and a link of the host tenant', async () => {
    seed({ price: 0 })
    ctx.user = null
    expect(await claimChallenge('tok')).toMatchObject({ success: false, code: 'unauthenticated' })
    ctx.user = { id: 'u1', email: 'u@x.com' }
    ctx.cookie = undefined
    expect(await claimChallenge('tok')).toMatchObject({ success: false, code: 'no_attempt' })
    ctx.cookie = 'raw-guest-token'
    db.tables.challenge_links[0].tenant_id = 'other'
    expect(await claimChallenge('tok')).toMatchObject({ success: false, code: 'invalid_link' })
    expect(ctx.rpcCalls).toEqual([])
  })

  it("someone else's cookie does not match the attempt", async () => {
    seed({ price: 0 })
    ctx.cookie = 'another-token'
    expect(await claimChallenge('tok')).toMatchObject({ success: false, code: 'no_attempt' })
    expect(attempt('g1').user_id).toBeNull()
  })

  it('RPC refusal (revoked/fee gate) yields no access', async () => {
    seed({ price: 0 })
    ctx.rpcError = { message: 'Access to this course was revoked' }
    expect(await claimChallenge('tok')).toMatchObject({ success: true, accessGranted: false, nextExerciseId: null })
  })

  it('inactive link claims and grants nothing', async () => {
    seed({ price: 0 })
    db.tables.challenge_links[0].active = false
    expect(await claimChallenge('tok')).toMatchObject({ success: false, code: 'unavailable' })
    expect(attempt('g1').user_id).toBeNull()
    expect(ctx.rpcCalls).toEqual([])
  })

  it('unpublished or non-challengeable exercise claims and grants nothing', async () => {
    seed({ price: 0 })
    db.tables.exercises[0].status = 'draft'
    expect(await claimChallenge('tok')).toMatchObject({ code: 'unavailable' })
    db.tables.exercises[0].status = 'published'
    db.tables.exercises[0].is_challengeable = false
    expect(await claimChallenge('tok')).toMatchObject({ code: 'unavailable' })
    expect(ctx.rpcCalls).toEqual([])
  })

  it('tenant with challenges disabled (or no setting row) claims and grants nothing', async () => {
    seed({ price: 0 })
    db.tables.tenant_settings[0].setting_value = false
    expect(await claimChallenge('tok')).toMatchObject({ code: 'unavailable' })
    db.tables.tenant_settings = []
    expect(await claimChallenge('tok')).toMatchObject({ code: 'unavailable' })
    expect(ctx.rpcCalls).toEqual([])
  })

  it('a soft-deleted priced plan does not make the course paid', async () => {
    seed({ planPrice: 10 })
    db.tables.plans[0].deleted_at = '2026-01-01'
    // the fake ignores `is(deleted_at, null)` rows that are set, like Postgres
    expect(await claimChallenge('tok')).toMatchObject({ success: true, accessGranted: true })
  })

  it.each(['products', 'product_courses', 'plan_courses', 'plans'])(
    'NEGATIVE: pricing query error on %s is unknown: no grant, retry',
    async (table) => {
      seed({ price: 0, planPrice: 0 })
      ctx.failTables = [table]
      expect(await claimChallenge('tok')).toMatchObject({ success: false, code: 'retry' })
      expect(ctx.rpcCalls).toEqual([])
    },
  )

  it('lost race (0 rows updated) does not report a claim; reports stored state', async () => {
    seed({ price: 0 })
    // a concurrent claim by another account takes the row before our update
    ctx.beforeUpdate = () => {
      attempt('g1').user_id = 'someone-else'
    }
    expect(await claimChallenge('tok')).toMatchObject({ success: false, code: 'claim_failed' })
    expect(ctx.rpcCalls).toEqual([])
  })
})
