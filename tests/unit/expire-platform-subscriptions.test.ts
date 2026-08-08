import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * First coverage for the school-billing expiry cron (issue #546). Before this
 * file `grep -rl "expire-platform-subscriptions" tests/` returned nothing, and
 * the two defects asserted here were invisible:
 *
 *   §2 an unpaid renewal request paused the downgrade FOREVER — nothing in the
 *       codebase ever moved a request out of an open status except a super
 *       admin, so "request renewal, never pay" kept the paid plan, its limits
 *       and its reduced platform fee indefinitely.
 *   §4 the grace window was computed from the subscription's period end rather
 *       than from when grace actually starts, so after an outage longer than
 *       GRACE_DAYS the same request sent "your payment is overdue" AND "you
 *       have been downgraded" — and both counters incremented, so the response
 *       looked healthy.
 *
 * The Supabase fake is a small in-memory store rather than a script of canned
 * replies: every phase re-queries the same tables, and phase ordering (does
 * phase 3 see what phase 2 just wrote?) is exactly what these bugs live in.
 */

type Row = Record<string, unknown>

const db: Record<string, Row[]> = {
  platform_subscriptions: [],
  platform_payment_requests: [],
  platform_subscription_switches: [],
  platform_plans: [],
  tenants: [],
  tenant_users: [],
}

const emails: { to: string; subject: string }[] = []
const downgraded: string[] = []

type Predicate = (row: Row) => boolean

function embed(table: string, cols: string, rows: Row[]): Row[] {
  return rows.map((row) => {
    const out: Row = { ...row }
    if (cols.includes('tenants(')) {
      out.tenants = db.tenants.find((t) => t.id === row.tenant_id) ?? null
    }
    if (cols.includes('platform_plans(')) {
      out.platform_plans = db.platform_plans.find((p) => p.plan_id === row.plan_id) ?? null
    }
    return out
  })
}

function makeSupabase() {
  function builder(table: string) {
    const preds: Predicate[] = []
    let cols = '*'
    let take = Infinity
    let pending: { op: 'update'; values: Row } | null = null

    const rows = () => {
      const matched = (db[table] || []).filter((r) => preds.every((p) => p(r)))
      return matched.slice(0, take === Infinity ? undefined : take)
    }

    function settle() {
      if (pending) {
        const changed = rows()
        for (const row of changed) Object.assign(row, pending.values)
        return { data: embed(table, cols, changed), error: null }
      }
      return { data: embed(table, cols, rows()), error: null }
    }

    const b: Record<string, unknown> = {
      select(c: string) {
        cols = c
        return b
      },
      update(values: Row) {
        pending = { op: 'update', values }
        return b
      },
      eq(col: string, val: unknown) {
        preds.push((r) => r[col] === val)
        return b
      },
      in(col: string, vals: unknown[]) {
        preds.push((r) => vals.includes(r[col] as never))
        return b
      },
      is(col: string, val: unknown) {
        preds.push((r) => (val === null ? r[col] == null : r[col] === val))
        return b
      },
      not(col: string, op: string, val: unknown) {
        if (op !== 'is') throw new Error(`fake: unsupported not(${op})`)
        preds.push((r) => (val === null ? r[col] != null : r[col] !== val))
        return b
      },
      lt(col: string, val: string) {
        preds.push((r) => r[col] != null && new Date(r[col] as string) < new Date(val))
        return b
      },
      lte(col: string, val: string) {
        preds.push((r) => r[col] != null && new Date(r[col] as string) <= new Date(val))
        return b
      },
      gte(col: string, val: string) {
        preds.push((r) => r[col] != null && new Date(r[col] as string) >= new Date(val))
        return b
      },
      order() {
        return b
      },
      limit(n: number) {
        take = n
        return b
      },
      maybeSingle() {
        const result = settle()
        const resultRows = (result.data as Row[] | null) || []
        return Promise.resolve({
          data: resultRows.length === 1 ? resultRows[0] : null,
          error: resultRows.length > 1 ? { message: 'more than one row' } : null,
        })
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
    }
    return b
  }

  return {
    from: (table: string) => builder(table),
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({ data: { user: { email: `${id}@example.com` } }, error: null }),
      },
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeSupabase() }))

vi.mock('@/lib/email/send', () => ({
  sendEmail: (o: { to: string; subject: string }) => {
    emails.push({ to: o.to, subject: o.subject })
    return Promise.resolve(true)
  },
}))

vi.mock('@/lib/billing/downgrade-tenant', () => ({
  downgradeTenantToFree: (_c: unknown, tenantId: string) => {
    downgraded.push(tenantId)
    return Promise.resolve(3)
  },
}))

import { GET } from '@/app/api/cron/expire-platform-subscriptions/route'

const TENANT = '00000000-0000-0000-0000-000000000001'
const PLAN = 'plan-pro'
const DAY = 24 * 60 * 60 * 1000

const daysFromNow = (d: number) => new Date(Date.now() + d * DAY).toISOString()

function req(secret = 'cron-secret'): NextRequest {
  return {
    headers: { get: (k: string) => (k === 'authorization' ? `Bearer ${secret}` : null) },
  } as unknown as NextRequest
}

function seedSub(over: Row = {}) {
  db.platform_subscriptions.push({
    tenant_id: TENANT,
    plan_id: PLAN,
    payment_provider: 'manual',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: daysFromNow(-1),
    grace_period_end: null,
    renewal_reminder_sent_at: null,
    ...over,
  })
  return db.platform_subscriptions[db.platform_subscriptions.length - 1]
}

function seedRequest(over: Row = {}) {
  db.platform_payment_requests.push({
    request_id: `req-${db.platform_payment_requests.length + 1}`,
    tenant_id: TENANT,
    plan_id: PLAN,
    request_type: 'renewal',
    status: 'pending',
    amount: 29,
    currency: 'usd',
    expires_at: daysFromNow(7),
    created_at: daysFromNow(-7),
    ...over,
  })
  return db.platform_payment_requests[db.platform_payment_requests.length - 1]
}

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  for (const key of Object.keys(db)) db[key] = []
  db.tenants.push({ id: TENANT, name: 'Test School', billing_status: 'active' })
  db.platform_plans.push({ plan_id: PLAN, name: 'Pro' })
  db.tenant_users.push({ tenant_id: TENANT, user_id: 'admin-1', role: 'admin', status: 'active' })
  emails.length = 0
  downgraded.length = 0
})

describe('expire-platform-subscriptions: auth', () => {
  it('rejects a request without the cron secret', async () => {
    const res = await GET(req('wrong'))
    expect(res.status).toBe(401)
    expect(downgraded).toEqual([])
  })
})

describe('expire-platform-subscriptions: §4 grace window after a missed week', () => {
  it('gives a full grace window even when the period lapsed 20 days ago', async () => {
    // Cron down for weeks (#513 is still open on whether anything on Dokploy
    // calls /api/cron/* at all), then recovers.
    const sub = seedSub({ current_period_end: daysFromNow(-20) })

    const res = await GET(req())
    const body = await res.json()

    expect(body.graceStarted).toBe(1)
    // The bug: graceEnd was period_end + 7d = 13 days in the PAST, and phase 3
    // re-queries in the same request, so the school was told it was overdue and
    // downgraded in one pass with no chance to pay.
    expect(body.downgraded).toBe(0)
    expect(downgraded).toEqual([])
    expect(sub.status).toBe('past_due')
    const graceMs = new Date(sub.grace_period_end as string).getTime() - Date.now()
    expect(graceMs).toBeGreaterThan(6.5 * DAY)
    expect(graceMs).toBeLessThan(7.5 * DAY)
  })

  it('downgrades on a later run once the grace window it was given has passed', async () => {
    seedSub({ status: 'past_due', current_period_end: daysFromNow(-30), grace_period_end: daysFromNow(-1) })

    const body = await (await GET(req())).json()

    expect(body.downgraded).toBe(1)
    expect(downgraded).toEqual([TENANT])
    expect(emails.map((e) => e.subject)).toContain(
      'Your Test School school has moved to the free plan'
    )
  })

  it('still reminds a school whose period has not lapsed yet', async () => {
    const sub = seedSub({ current_period_end: daysFromNow(3) })

    const body = await (await GET(req())).json()

    expect(body).toMatchObject({ reminded: 1, graceStarted: 0, downgraded: 0 })
    expect(sub.renewal_reminder_sent_at).not.toBeNull()
  })
})

describe('expire-platform-subscriptions: §2 renewal-request TTL', () => {
  it('pauses the downgrade while a renewal request is still open', async () => {
    seedSub({ status: 'past_due', grace_period_end: daysFromNow(-1) })
    seedRequest({ expires_at: daysFromNow(5) })

    const body = await (await GET(req())).json()

    expect(body).toMatchObject({ skippedPendingRenewal: 1, downgraded: 0, requestsExpired: 0 })
    expect(downgraded).toEqual([])
  })

  it('expires a lapsed request, notifies, and stops pausing the downgrade', async () => {
    seedSub({ status: 'past_due', grace_period_end: daysFromNow(-1) })
    const request = seedRequest({ expires_at: daysFromNow(-1) })

    const body = await (await GET(req())).json()

    expect(request.status).toBe('expired')
    expect(body).toMatchObject({ requestsExpired: 1, skippedPendingRenewal: 0, downgraded: 1 })
    expect(downgraded).toEqual([TENANT])
    expect(emails.map((e) => e.subject)).toContain(
      'Your Pro payment request for Test School has expired'
    )
  })

  it('abandons the linked pending switch when its payment request expires', async () => {
    db.platform_subscription_switches.push({
      switch_id: 'switch-1',
      tenant_id: TENANT,
      state: 'pending_activation',
      expires_at: daysFromNow(5),
    })
    seedRequest({ switch_id: 'switch-1', expires_at: daysFromNow(-1) })

    await GET(req())

    expect(db.platform_subscription_switches[0]).toMatchObject({
      state: 'abandoned',
      last_error: 'Linked payment request expired',
    })
  })

  it('leaves confirmed and rejected requests alone', async () => {
    const confirmed = seedRequest({ status: 'confirmed', expires_at: daysFromNow(-30) })
    const rejected = seedRequest({ status: 'rejected', expires_at: daysFromNow(-30) })

    const body = await (await GET(req())).json()

    expect(body.requestsExpired).toBe(0)
    expect(confirmed.status).toBe('confirmed')
    expect(rejected.status).toBe('rejected')
  })

  it('expires a lapsed upgrade request too, without pausing anything', async () => {
    const upgrade = seedRequest({ request_type: 'upgrade', expires_at: daysFromNow(-2) })

    const body = await (await GET(req())).json()

    expect(upgrade.status).toBe('expired')
    expect(body.requestsExpired).toBe(1)
  })
})

describe('expire-platform-subscriptions: §1 cancel-then-repay', () => {
  it('downgrades a subscription still flagged cancel_at_period_end', async () => {
    // What confirmManualPayment used to leave behind: a paid-for period on a row
    // whose stale cancel flag survived the upsert.
    seedSub({ cancel_at_period_end: true, current_period_end: daysFromNow(-1) })

    const body = await (await GET(req())).json()

    expect(body.canceled).toBe(1)
    expect(downgraded).toEqual([TENANT])
    // Silent: phases 1 and 2 both filter on cancel_at_period_end = false, so
    // this school got neither a reminder nor a grace window.
    expect(body.reminded).toBe(0)
    expect(body.graceStarted).toBe(0)
  })

  it('reminds and grants grace once the flag is cleared by the repayment', async () => {
    seedSub({ cancel_at_period_end: false, current_period_end: daysFromNow(-1) })

    const body = await (await GET(req())).json()

    expect(body).toMatchObject({ canceled: 0, graceStarted: 1, downgraded: 0 })
    expect(downgraded).toEqual([])
  })
})

describe('expire-platform-subscriptions: bounded switch cleanup', () => {
  it('finishes critical downgrades and processes at most ten cleanup rows', async () => {
    seedSub({ status: 'past_due', grace_period_end: daysFromNow(-1) })
    for (let i = 0; i < 12; i++) {
      db.platform_subscription_switches.push({
        switch_id: `switch-${i}`,
        tenant_id: TENANT,
        source_payment_provider: 'manual',
        source_provider_subscription_id: null,
        source_period_end: null,
        state: 'cancellation_pending',
        cancel_attempts: 0,
        next_retry_at: daysFromNow(-1),
      })
    }

    const body = await (await GET(req())).json()

    expect(body.downgraded).toBe(1)
    expect(body.switchCancellationsCompleted).toBe(10)
    expect(db.platform_subscription_switches.filter((row) => row.state === 'completed')).toHaveLength(10)
    expect(db.platform_subscription_switches.filter((row) => row.state === 'cancellation_pending')).toHaveLength(2)
  })
})

describe('expire-platform-subscriptions: #610 every rail whose period we own', () => {
  it('lapses a Binance Pay subscription exactly like a bank transfer', async () => {
    // The four phases filtered `payment_provider = 'manual'`, so the first
    // non-manual self-managed rail would have kept its plan forever: no
    // reminder, no grace window, no downgrade — one month's money for good.
    const sub = seedSub({ payment_provider: 'binance', current_period_end: daysFromNow(-1) })
    const res = await GET(req())

    expect((await res.json()).graceStarted).toBe(1)
    expect(sub.status).toBe('past_due')
    expect(sub.grace_period_end).toBeTruthy()
  })

  it('reminds a Solana subscriber before its period ends', async () => {
    const sub = seedSub({ payment_provider: 'solana', current_period_end: daysFromNow(3) })
    const res = await GET(req())

    expect((await res.json()).reminded).toBe(1)
    expect(sub.renewal_reminder_sent_at).toBeTruthy()
  })

  it('never touches a rail that renews itself', async () => {
    // Stripe expiry is decided by its webhook. Lapsing it here would downgrade
    // a school whose card is fine but whose renewal event is a minute late.
    const sub = seedSub({ payment_provider: 'stripe', current_period_end: daysFromNow(-30) })
    const res = await GET(req())

    expect((await res.json()).graceStarted).toBe(0)
    expect(sub.status).toBe('active')
  })

  it('never expires a solana_subs row the crank is still charging', async () => {
    const sub = seedSub({ payment_provider: 'solana_subs', current_period_end: daysFromNow(-2) })
    await GET(req())
    expect(sub.status).toBe('active')
  })
})
