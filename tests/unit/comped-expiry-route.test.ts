import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
const emails: { to: string; subject: string }[] = []
const inApp: { userId: string; kind: string }[] = []
const flags = vi.hoisted(() => ({ emailOk: true, inAppOk: true }))

function makeSupabase() {
  function builder(table: string) {
    const preds: ((r: Row) => boolean)[] = []
    let pending: { op: 'update' | 'insert'; values: Row } | null = null
    const get = (r: Row, col: string) => {
      if (col.includes('->>')) {
        const [c, k] = col.split('->>')
        return ((r[c] as Row | null) ?? {})[k] ?? null
      }
      return r[col]
    }
    const settle = () => {
      if (pending?.op === 'insert') {
        db[table].push({ ...pending.values })
        return { data: [pending.values], error: null }
      }
      const rows = (db[table] || []).filter((r) => preds.every((p) => p(r)))
      if (pending) for (const r of rows) Object.assign(r, pending.values)
      return { data: rows.map((r) => ({ ...r })), error: null, count: rows.length }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      range: () => b,
      update: (v: Row) => ((pending = { op: 'update', values: v }), b),
      insert: (v: Row) => ((pending = { op: 'insert', values: v }), b),
      eq: (c: string, v: unknown) => (preds.push((r) => get(r, c) === v), b),
      is: (c: string, v: unknown) => (preds.push((r) => (v === null ? get(r, c) == null : get(r, c) === v)), b),
      not: (c: string, _o: string, v: unknown) => (preds.push((r) => (v === null ? get(r, c) != null : get(r, c) !== v)), b),
      lte: (c: string, v: string) => (preds.push((r) => get(r, c) != null && new Date(get(r, c) as string) <= new Date(v)), b),
      maybeSingle: () => {
        const rows = settle().data as Row[]
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
    }
    return b
  }
  return {
    from: (t: string) => builder(t),
    auth: { admin: { getUserById: (id: string) => Promise.resolve({ data: { user: { email: `${id}@example.com` } } }) } },
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeSupabase() }))
vi.mock('@sentry/nextjs', () => ({ withMonitor: (_n: string, fn: () => unknown) => fn() }))
vi.mock('@/lib/email/send', () => ({
  sendEmail: (o: { to: string; subject: string }) => {
    if (flags.emailOk) emails.push({ to: o.to, subject: o.subject })
    return Promise.resolve(flags.emailOk)
  },
}))
vi.mock('@/lib/i18n/tenant-locale', () => ({ resolveTenantLocale: () => Promise.resolve('en') }))
vi.mock('@/lib/notifications/member-notice', () => ({
  writeUserNotification: (p: { userId: string; kind: string }) => {
    if (flags.inAppOk) inApp.push({ userId: p.userId, kind: p.kind })
    return Promise.resolve(flags.inAppOk)
  },
}))

import { GET } from '@/app/api/cron/comped-expiry/route'

const T = 'tenant-1'
const DAY = 24 * 60 * 60 * 1000
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString()

function req(secret = 'cron-secret', query = ''): NextRequest {
  return {
    headers: { get: (k: string) => (k === 'authorization' ? `Bearer ${secret}` : null) },
    nextUrl: { searchParams: new URLSearchParams(query) },
  } as unknown as NextRequest
}

const tenant = () => db.tenants[0]

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  for (const k of ['tenants', 'platform_plans', 'platform_subscriptions', 'tenant_users', 'super_admins']) db[k] = []
  db.platform_plans.push({ plan_id: 'p-ent', slug: 'enterprise', name: 'Enterprise' })
  db.tenant_users.push({ tenant_id: T, user_id: 'admin-1', role: 'admin', status: 'active' })
  db.super_admins.push({ user_id: 'owner-1' })
  db.tenants.push({
    id: T, name: 'Friend School', plan: 'enterprise', billing_mode: 'comped',
    comped_until: inDays(10), comped_notice_sent: {}, comped_reason: 'partner', fee_percent_override: 5,
  })
  emails.length = 0
  inApp.length = 0
  flags.emailOk = true
  flags.inAppOk = true
})

describe('comped-expiry route', () => {
  it('401 without the secret', async () => {
    expect((await GET(req('wrong'))).status).toBe(401)
    expect(emails).toEqual([])
  })

  it('notices: one run sends once (admin email + in-app + owner), second run is a no-op', async () => {
    const first = await (await GET(req())).json()
    expect(first.notices['14']).toBe(1)
    expect(emails.map((e) => e.to).sort()).toEqual(['admin-1@example.com', 'owner-1@example.com'])
    expect(inApp).toEqual([{ userId: 'admin-1', kind: 'comped_expiry' }])
    expect(Object.keys(tenant().comped_notice_sent as object).sort()).toEqual(['14', '30'])

    const second = await (await GET(req())).json()
    expect(second.notices).toEqual({ '30': 0, '14': 0, '3': 0 })
    expect(emails).toHaveLength(2)
  })

  it('releases the claim when nothing was delivered, so the next run retries', async () => {
    flags.emailOk = false
    flags.inAppOk = false
    const body = await (await GET(req())).json()
    expect(body.noticeFailures).toBe(1)
    expect(tenant().comped_notice_sent).toEqual({})
    flags.emailOk = true
    flags.inAppOk = true
    expect((await (await GET(req())).json()).notices['14']).toBe(1)
  })

  it('dryRun writes and sends nothing', async () => {
    const body = await (await GET(req('cron-secret', 'dryRun=1'))).json()
    expect(body.notices['14']).toBe(1)
    expect(emails).toEqual([])
    expect(tenant().comped_notice_sent).toEqual({})
  })

  it('expiry flips to paid once and starts the 7-day grace on an override row', async () => {
    tenant().comped_until = inDays(-1)
    db.platform_subscriptions.push({
      tenant_id: T, plan_id: 'p-ent', status: 'active', payment_provider: 'manual',
      current_period_end: null, grace_period_end: null,
    })

    const first = await (await GET(req())).json()
    expect(first.expired).toBe(1)
    expect(first.graceStarted).toBe(1)
    expect(tenant()).toMatchObject({
      billing_mode: 'paid', comped_until: null, comped_reason: null, fee_percent_override: null, billing_status: 'past_due',
    })
    const sub = db.platform_subscriptions[0]
    expect(sub.status).toBe('past_due')
    const graceMs = new Date(sub.grace_period_end as string).getTime() - Date.now()
    expect(graceMs).toBeGreaterThan(6.9 * DAY)
    expect(graceMs).toBeLessThanOrEqual(7 * DAY)
    expect(emails.map((e) => e.subject).every((s) => /ended/i.test(s))).toBe(true)

    const mailCount = emails.length
    const second = await (await GET(req())).json()
    expect(second.expired).toBe(0)
    expect(emails).toHaveLength(mailCount)
  })

  it('expiry with no subscription row inserts a past_due grace row; free schools get no grace', async () => {
    tenant().comped_until = inDays(-1)
    expect((await (await GET(req())).json()).graceStarted).toBe(1)
    expect(db.platform_subscriptions).toHaveLength(1)
    expect(db.platform_subscriptions[0]).toMatchObject({ status: 'past_due', payment_provider: 'manual' })

    db.platform_subscriptions.length = 0
    Object.assign(tenant(), { billing_mode: 'comped', comped_until: inDays(-1), plan: 'free' })
    const body = await (await GET(req())).json()
    expect(body.expired).toBe(1)
    expect(body.graceStarted).toBe(0)
    expect(db.platform_subscriptions).toHaveLength(0)
  })
})
