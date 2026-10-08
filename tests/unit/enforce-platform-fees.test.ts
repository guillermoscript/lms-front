import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import {
  runPlatformFeeEnforcement,
  type FeeConfig,
  type FeeStanding,
  type FeeStatement,
  type FeeStore,
  type FeeTxnRow,
  type StandingState,
} from '@/lib/billing/platform-fee-enforcement'
import type { FeePayment } from '@/lib/payments/platform-fee-owed'

/**
 * #929 enforcement cron (design §3 and test plan §6): each phase is
 * status-gated and idempotent on rerun, email failures are swallowed,
 * dryRun writes nothing, notify_only NEVER sets blocked_at, the per-run block
 * cap holds, and the route refuses a missing bearer. The store is in memory:
 * phase ordering (does phase 2 see what phase 1 wrote?) is the point.
 */

const T1 = '11111111-1111-1111-1111-111111111111'
const T2 = '22222222-2222-2222-2222-222222222222'
const T3 = '33333333-3333-3333-3333-333333333333'
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'

interface Mem {
  config: FeeConfig
  tenants: { id: string; name: string; slug: string }[]
  txns: Record<string, FeeTxnRow[]>
  payments: Record<string, FeePayment[]>
  standing: Record<string, FeeStanding>
  statements: FeeStatement[]
  writes: number
  reevaluated: string[]
}

let mem: Mem

function sale(date: string, amount = 100, provider = 'manual'): FeeTxnRow {
  return {
    paymentProvider: provider,
    amount,
    refundedAmount: 0,
    currency: 'usd',
    schoolPercentageSnapshot: 80,
    status: 'successful',
    transactionDate: date,
  }
}

function reset(mode: FeeConfig['enforcementMode'] = 'notify_only') {
  mem = {
    config: { enforcementMode: mode, feeGraceDays: 7, minBlockingBalance: 1, hyperinflationCurrencies: ['VES'] },
    tenants: [{ id: T1, name: 'School One', slug: 'one' }],
    txns: { [T1]: [sale('2026-09-10T10:00:00Z')] }, // fee 20.00 USD for September
    payments: {},
    standing: {},
    statements: [],
    writes: 0,
    reevaluated: [],
  }
}

const store: FeeStore = {
  async getConfig() {
    return mem.config
  },
  async listTenants() {
    return mem.tenants
  },
  async getLedger(id) {
    return { txns: mem.txns[id] ?? [], payments: mem.payments[id] ?? [], fallbackSchoolPercentage: 80 }
  },
  async getStanding(id) {
    return mem.standing[id] ? { ...mem.standing[id] } : null
  },
  async listStatements(id, since) {
    return mem.statements.filter((s) => s.tenantId === id && s.periodStart >= since).map((s) => ({ ...s }))
  },
  async insertStatement(row) {
    if (mem.statements.some((s) => s.tenantId === row.tenantId && s.currency === row.currency && s.periodStart === row.periodStart)) {
      return null
    }
    mem.writes++
    const st: FeeStatement = {
      statementId: `st-${mem.statements.length + 1}`,
      tenantId: row.tenantId,
      currency: row.currency,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      feeAmount: row.feeAmount,
      statementNumber: `PF-${row.yyyymm}-${mem.statements.length + 1}`,
      dueAt: row.dueAt,
      issuedEmailSentAt: null,
      reminderSentAt: null,
      overdueEmailSentAt: null,
    }
    mem.statements.push(st)
    return { ...st }
  },
  async stampStatement(id, column, at) {
    mem.writes++
    const st = mem.statements.find((s) => s.statementId === id)!
    const key = { issued_email_sent_at: 'issuedEmailSentAt', reminder_sent_at: 'reminderSentAt', overdue_email_sent_at: 'overdueEmailSentAt' }[column] as
      'issuedEmailSentAt' | 'reminderSentAt' | 'overdueEmailSentAt'
    st[key] ??= at
  },
  async transitionStanding(id, from, patch) {
    const cur = mem.standing[id]
    if ((cur?.state ?? null) !== from) return false
    mem.writes++
    mem.standing[id] = {
      tenantId: id,
      state: patch.state,
      overdueSince: patch.overdue_since !== undefined ? patch.overdue_since : cur?.overdueSince ?? null,
      blockedAt: patch.blocked_at !== undefined ? patch.blocked_at : cur?.blockedAt ?? null,
    }
    return true
  },
  async reevaluate(id) {
    mem.writes++
    mem.reevaluated.push(id)
    mem.standing[id] = { tenantId: id, state: 'ok', overdueSince: null, blockedAt: null }
    return 'ok'
  },
  async adminEmails() {
    return ['admin@school.test']
  },
  async locale() {
    return 'en'
  },
}

const sent: { to: string; subject: string }[] = []
let failEmails = false
const sendEmail = vi.fn(async (o: { to: string; subject: string; html: string }) => {
  if (failEmails) throw new Error('smtp down')
  sent.push({ to: o.to, subject: o.subject })
  return true
})

function run(now: string, extra: { dryRun?: boolean; blockCap?: number } = {}) {
  return runPlatformFeeEnforcement(store, { now: new Date(now), sendEmail, tenantUrl: (s) => `https://${s}.test`, ...extra })
}

function setStanding(id: string, state: StandingState, overdueSince: string | null, blockedAt: string | null = null) {
  mem.standing[id] = { tenantId: id, state, overdueSince, blockedAt }
}

beforeEach(() => {
  reset()
  sent.length = 0
  failEmails = false
  sendEmail.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('phase 0 — close the month', () => {
  it('freezes last month once per tenant+currency, emails once, rerun is a no-op', async () => {
    const first = await run('2026-10-02T06:00:00Z')
    expect(first.statementsClosed).toBe(1)
    expect(first.statementEmails).toBe(1)
    expect(mem.statements).toHaveLength(1)
    expect(mem.statements[0]).toMatchObject({
      currency: 'USD',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      feeAmount: 20,
      dueAt: '2026-10-04T00:00:00.000Z',
    })
    expect(mem.statements[0].issuedEmailSentAt).not.toBeNull()

    const second = await run('2026-10-02T07:00:00Z')
    expect(second.statementsClosed).toBe(0)
    expect(second.statementEmails).toBe(0)
    expect(mem.statements).toHaveLength(1)
    expect(sent.filter((e) => /statement/i.test(e.subject))).toHaveLength(1)
  })

  it('does not issue a statement when the balance is already paid', async () => {
    mem.payments[T1] = [{ amount: 20, currency: 'USD', status: 'succeeded' }]
    const r = await run('2026-10-02T06:00:00Z')
    expect(r.statementsClosed).toBe(0)
  })

  it('only counts rails where the school collected the money', async () => {
    mem.txns[T1] = [sale('2026-09-10T10:00:00Z', 100, 'stripe')]
    const r = await run('2026-10-02T06:00:00Z')
    expect(r.statementsClosed).toBe(0)
    expect(r.tenantsScanned).toBe(1)
  })
})

describe('phase 1 — reminder', () => {
  it('reminds the day before due, stamps, moves standing to reminded, and only once', async () => {
    const r = await run('2026-10-03T06:00:00Z')
    expect(r.reminded).toBe(1)
    expect(mem.statements[0].reminderSentAt).not.toBeNull()
    expect(mem.standing[T1].state).toBe('reminded')
    expect(mem.standing[T1].blockedAt).toBeNull()

    const again = await run('2026-10-03T08:00:00Z')
    expect(again.reminded).toBe(0)
  })
})

describe('phase 2 — overdue', () => {
  it('marks overdue after due, with overdue_since, idempotent on rerun', async () => {
    await run('2026-10-03T06:00:00Z') // reminded
    const r = await run('2026-10-05T06:00:00Z')
    expect(r.overdue).toBe(1)
    expect(mem.standing[T1]).toMatchObject({ state: 'overdue', overdueSince: '2026-10-05T06:00:00.000Z', blockedAt: null })
    expect(mem.statements[0].overdueEmailSentAt).not.toBeNull()

    const again = await run('2026-10-06T06:00:00Z')
    expect(again.overdue).toBe(0)
    expect(mem.standing[T1].overdueSince).toBe('2026-10-05T06:00:00.000Z')
  })

  it('a balance accrued THIS month is not overdue', async () => {
    mem.txns[T1] = [sale('2026-10-02T10:00:00Z')]
    const r = await run('2026-10-05T06:00:00Z')
    expect(r.overdue).toBe(0)
    expect(mem.standing[T1]).toBeUndefined()
  })
})

describe('phase 3 — block', () => {
  it('notify_only NEVER sets blocked_at; it reports wouldBlock', async () => {
    setStanding(T1, 'overdue', '2026-10-04T06:00:00Z')
    const r = await run('2026-10-20T06:00:00Z')
    expect(r.wouldBlock).toBe(1)
    expect(r.blocked).toBe(0)
    expect(mem.standing[T1].state).toBe('overdue')
    expect(mem.standing[T1].blockedAt).toBeNull()
  })

  it('enforce blocks after the grace period, not before', async () => {
    reset('enforce')
    setStanding(T1, 'overdue', '2026-10-04T06:00:00Z')
    const early = await run('2026-10-10T06:00:00Z') // 6 days < 7
    expect(early.blocked).toBe(0)
    const r = await run('2026-10-12T06:00:00Z')
    expect(r.blocked).toBe(1)
    expect(mem.standing[T1]).toMatchObject({ state: 'blocked', blockedAt: '2026-10-12T06:00:00.000Z' })
    expect(sent.some((e) => /paused/i.test(e.subject))).toBe(true)

    const again = await run('2026-10-13T06:00:00Z')
    expect(again.blocked).toBe(0)
  })

  it('never blocks under the minimum blocking balance', async () => {
    reset('enforce')
    mem.txns[T1] = [sale('2026-09-10T10:00:00Z', 2.5)] // fee 0.50
    setStanding(T1, 'overdue', '2026-10-04T06:00:00Z')
    const r = await run('2026-10-20T06:00:00Z')
    expect(r.blocked).toBe(0)
    expect(mem.standing[T1].blockedAt).toBeNull()
  })

  it('caps new blocks per run', async () => {
    reset('enforce')
    mem.tenants = [T1, T2, T3].map((id, i) => ({ id, name: `S${i}`, slug: `s${i}` }))
    for (const id of [T1, T2, T3]) {
      mem.txns[id] = [sale('2026-09-10T10:00:00Z')]
      setStanding(id, 'overdue', '2026-10-01T06:00:00Z')
    }
    const r = await run('2026-10-20T06:00:00Z', { blockCap: 2 })
    expect(r.blocked).toBe(2)
    expect(r.blockCapReached).toBe(true)
    expect(Object.values(mem.standing).filter((s) => s.blockedAt)).toHaveLength(2)
  })

  it('never blocks the default (platform) school', async () => {
    reset('enforce')
    mem.tenants = [{ id: DEFAULT_TENANT, name: 'Default', slug: 'default' }]
    mem.txns[DEFAULT_TENANT] = [sale('2026-09-10T10:00:00Z')]
    setStanding(DEFAULT_TENANT, 'overdue', '2026-10-01T06:00:00Z')
    const r = await run('2026-10-20T06:00:00Z')
    expect(r.blocked).toBe(0)
  })
})

describe('phase 4 — recover', () => {
  it('a paid blocked school is cleared through reevaluate and told sales resumed', async () => {
    reset('enforce')
    setStanding(T1, 'blocked', '2026-10-04T06:00:00Z', '2026-10-12T06:00:00Z')
    mem.payments[T1] = [{ amount: 20, currency: 'USD', status: 'succeeded' }]
    const r = await run('2026-10-20T06:00:00Z')
    expect(r.unblocked).toBe(1)
    expect(r.recovered).toBe(1)
    expect(mem.reevaluated).toEqual([T1])
    expect(mem.standing[T1]).toMatchObject({ state: 'ok', blockedAt: null })
    expect(sent.some((e) => /resumed/i.test(e.subject))).toBe(true)
  })

  it('leaves a still-overdue school alone', async () => {
    setStanding(T1, 'overdue', '2026-10-04T06:00:00Z')
    mem.payments[T1] = [{ amount: 5, currency: 'USD', status: 'succeeded' }]
    const r = await run('2026-10-06T06:00:00Z')
    expect(r.recovered).toBe(0)
    expect(mem.reevaluated).toEqual([])
  })
})

describe('safety rails', () => {
  it('email failure is swallowed: transitions still happen, stamps stay unset, next run retries', async () => {
    failEmails = true
    const r = await run('2026-10-05T06:00:00Z')
    expect(r.errors).toBe(0)
    expect(r.emailFailures).toBeGreaterThan(0)
    expect(r.statementsClosed).toBe(1)
    expect(mem.standing[T1].state).toBe('overdue')
    expect(mem.statements[0].issuedEmailSentAt).toBeNull()
    expect(mem.statements[0].overdueEmailSentAt).toBeNull()

    failEmails = false
    const retry = await run('2026-10-05T07:00:00Z')
    expect(retry.statementEmails).toBe(1)
    expect(mem.statements[0].issuedEmailSentAt).not.toBeNull()
    expect(mem.statements[0].overdueEmailSentAt).not.toBeNull()
  })

  it('dryRun writes nothing and sends nothing, but lists the would-act set', async () => {
    reset('enforce')
    mem.tenants.push({ id: T2, name: 'Two', slug: 'two' })
    mem.txns[T2] = [sale('2026-09-10T10:00:00Z')]
    setStanding(T2, 'overdue', '2026-10-01T06:00:00Z')
    const before = JSON.stringify(mem)
    const r = await run('2026-10-20T06:00:00Z', { dryRun: true })
    expect(JSON.stringify(mem)).toBe(before)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(r.dryRun).toBe(true)
    expect(r.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: T1, action: 'close_statement' }),
        expect.objectContaining({ tenantId: T1, action: 'overdue' }),
        expect.objectContaining({ tenantId: T2, action: 'block' }),
      ]),
    )
  })

  it("'off' is a no-op kill switch", async () => {
    reset('off')
    setStanding(T1, 'overdue', '2026-10-01T06:00:00Z')
    const r = await run('2026-10-20T06:00:00Z')
    expect(r.skipped).toBe(true)
    expect(mem.writes).toBe(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('one tenant failing does not stop the others', async () => {
    mem.tenants.push({ id: T2, name: 'Two', slug: 'two' })
    mem.txns[T2] = [sale('2026-09-10T10:00:00Z')]
    const original = store.getLedger
    store.getLedger = async (id) => {
      if (id === T1) throw new Error('boom')
      return original(id)
    }
    try {
      const r = await run('2026-10-05T06:00:00Z')
      expect(r.errors).toBe(1)
      expect(mem.standing[T2].state).toBe('overdue')
    } finally {
      store.getLedger = original
    }
  })
})

describe('route', () => {
  it('refuses a request without the bearer secret', async () => {
    vi.stubEnv('CRON_SECRET', 'shh')
    const { GET } = await import('@/app/api/cron/enforce-platform-fees/route')
    const req = {
      headers: new Headers(),
      nextUrl: new URL('https://x.test/api/cron/enforce-platform-fees?dryRun=1'),
    } as unknown as NextRequest
    const res = await GET(req)
    expect(res.status).toBe(401)
    vi.unstubAllEnvs()
  })
})
