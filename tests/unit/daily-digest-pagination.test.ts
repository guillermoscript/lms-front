import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const sentEmails: Array<{ to: string; subject: string }> = []
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (msg: { to: string; subject: string }) => {
    sentEmails.push({ to: msg.to, subject: msg.subject })
    return true
  }),
}))

import { fetchDigestCandidates, runDailyDigest } from '@/lib/notifications/daily-digest'

/**
 * Cap-forcing tests for the daily digest (issue #548).
 *
 * The point of these is that they FAIL on a small dataset read without
 * pagination — the fake server below clamps every response to `serverCap`
 * rows exactly as PostgREST's "Max rows" does (`supabase/config.toml:18`),
 * while still reporting the true `count`. Every fixture here is deliberately
 * several times larger than the cap, so a single unpaged read cannot possibly
 * see all of it. `requestsFor()` asserts the cap was genuinely exercised
 * rather than accidentally avoided.
 *
 * The two behaviours under test are not "a total is slightly off": a truncated
 * preferences read EMAILS STUDENTS WHO TURNED EMAIL OFF, and a truncated
 * idempotency read RE-SENDS a digest the tenant already received.
 */

interface Row {
  [column: string]: unknown
}

const TENANT = '00000000-0000-0000-0000-0000000000aa'
/** 17:30 UTC — the default send hour (17), and not the nudge hour (20). */
const NOW = new Date('2026-07-14T17:30:00Z')

/** Deterministic, ordered uuids so keyset paging has something real to sort. */
const userId = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const emailFor = (n: number) => `student${n}@example.com`

/**
 * An in-memory PostgREST with a row cap.
 *
 * Supports the slice of the API the digest uses: select/eq/in/order/range with
 * `count: 'exact'`, `metadata->>key` json accessors, insert, and the
 * keyset-paginated candidates RPC. `serverCap` clamps every response — ranged
 * ones included, which is the whole trap: a short page is NOT the end of the
 * relation.
 */
function makeServer(options: {
  serverCap: number
  candidates: Row[]
  preferences?: Row[]
  tenants?: Row[]
  notifications?: Row[]
  failPreferences?: boolean
}) {
  const db: Record<string, Row[]> = {
    tenants: options.tenants ?? [{ id: TENANT, name: 'Cap School', slug: 'cap' }],
    tenant_settings: [],
    notification_templates: [],
    notification_preferences: options.preferences ?? [],
    notifications: options.notifications ?? [],
    user_notifications: [],
  }
  const requests: Record<string, number> = {}
  let nextId = 10_000

  const value = (row: Row, column: string): unknown => {
    const json = column.match(/^(\w+)->>(\w+)$/)
    if (json) return (row[json[1]] as Record<string, unknown> | null)?.[json[2]]
    return row[column]
  }

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    const orderBy: Array<{ column: string; ascending: boolean }> = []
    let from = 0
    let to = Number.MAX_SAFE_INTEGER

    const run = () => {
      requests[table] = (requests[table] ?? 0) + 1
      let rows = db[table].filter((r) => filters.every((f) => f(r)))
      for (const { column, ascending } of [...orderBy].reverse()) {
        rows = [...rows].sort((a, b) => {
          const [x, y] = [value(a, column), value(b, column)]
          const cmp = x === y ? 0 : (x as number | string) < (y as number | string) ? -1 : 1
          return ascending ? cmp : -cmp
        })
      }
      const count = rows.length
      // The cap applies to the ranged window, not to the relation.
      const data = rows.slice(from, to + 1).slice(0, options.serverCap)
      return { data, error: null, count }
    }

    const api = {
      select: () => api,
      eq: (column: string, v: unknown) => {
        filters.push((r) => value(r, column) === v)
        return api
      },
      in: (column: string, values: unknown[]) => {
        filters.push((r) => values.includes(value(r, column)))
        return api
      },
      or: () => api,
      order: (column: string, opts?: { ascending?: boolean }) => {
        orderBy.push({ column, ascending: opts?.ascending !== false })
        return api
      },
      range: (f: number, t: number) => {
        from = f
        to = t
        return api
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    }
    return api
  }

  const client = {
    from(table: string) {
      if (table === 'notification_preferences' && options.failPreferences) {
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                range: () => ({
                  then: (resolve: (v: unknown) => unknown) =>
                    Promise.resolve({ data: null, error: { message: 'connection reset' }, count: null }).then(resolve),
                }),
              }),
            }),
          }),
        }
      }
      return {
        ...builder(table),
        insert(row: Row) {
          const stored = { id: nextId++, ...row }
          db[table].push(stored)
          const result = { data: { id: stored.id }, error: null }
          return {
            select: () => ({ single: async () => result }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
          }
        },
      }
    },

    /** Keyset-paginated candidates, clamped by the same cap. */
    async rpc(_fn: string, args: { _after_tenant_id: string | null; _after_user_id: string | null; _limit: number }) {
      requests.rpc = (requests.rpc ?? 0) + 1
      const sorted = [...options.candidates].sort((a, b) =>
        `${a.tenant_id}${a.user_id}` < `${b.tenant_id}${b.user_id}` ? -1 : 1
      )
      const after = args._after_tenant_id ? `${args._after_tenant_id}${args._after_user_id}` : null
      const remaining = after ? sorted.filter((r) => `${r.tenant_id}${r.user_id}` > after) : sorted
      return { data: remaining.slice(0, Math.min(args._limit, options.serverCap)), error: null }
    },
  }

  return { client: client as unknown as SupabaseClient, db, requestsFor: (t: string) => requests[t] ?? 0 }
}

/** `n` students, all with review cards due, so all are digest recipients. */
function candidates(n: number, tenant = TENANT): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    tenant_id: tenant,
    user_id: userId(i),
    email: emailFor(i),
    full_name: `Student ${i}`,
    due_cards: 3,
    goals_pending: 0,
    current_streak: 0,
    last_activity_date: null,
  }))
}

const CAP = 7
const STUDENTS = 40

beforeEach(() => {
  sentEmails.length = 0
})

describe('fetchDigestCandidates', () => {
  it('#548: reads every candidate when the server caps each page far below the ask', async () => {
    const { client, requestsFor } = makeServer({ serverCap: CAP, candidates: candidates(STUDENTS) })
    const rows = await fetchDigestCandidates(client)
    expect(rows).toHaveLength(STUDENTS)
    // The cap was real: 40 rows at 7 per response cannot be one request.
    expect(requestsFor('rpc')).toBeGreaterThan(1)
    // And no row was seen twice — the keyset advanced strictly.
    expect(new Set(rows.map((r) => r.user_id)).size).toBe(STUDENTS)
  })

  it('stops on an empty page, not a short one', async () => {
    // Every page here is short (cap 7 < the 500 asked for). Treating short as
    // "exhausted" would return 7 of 40 — the exact #548 failure.
    const { client } = makeServer({ serverCap: CAP, candidates: candidates(STUDENTS) })
    await expect(fetchDigestCandidates(client)).resolves.toHaveLength(STUDENTS)
  })

  it('returns an empty set without looping when there are no candidates', async () => {
    const { client, requestsFor } = makeServer({ serverCap: CAP, candidates: [] })
    await expect(fetchDigestCandidates(client)).resolves.toEqual([])
    expect(requestsFor('rpc')).toBe(1)
  })

  it('surfaces an RPC error instead of silently digesting nobody', async () => {
    const client = { rpc: async () => ({ data: null, error: { message: 'permission denied' } }) }
    await expect(fetchDigestCandidates(client as unknown as SupabaseClient)).rejects.toThrow('permission denied')
  })
})

describe('runDailyDigest past the row cap', () => {
  it('#548: sends to every candidate, not just the first capped page', async () => {
    const { client, requestsFor } = makeServer({ serverCap: CAP, candidates: candidates(STUDENTS) })
    const result = await runDailyDigest(client, NOW)

    expect(result.errors).toEqual([])
    expect(result.digestsSent).toBe(STUDENTS)
    expect(result.emailsSent).toBe(STUDENTS)
    expect(sentEmails).toHaveLength(STUDENTS)
    // Proof the cap was genuinely in play: 40 candidates could not have
    // arrived in one 7-row response.
    expect(requestsFor('rpc')).toBeGreaterThan(1)
  })

  it('#548 acceptance: a second run the same tenant-local day sends ZERO additional emails', async () => {
    const server = makeServer({ serverCap: CAP, candidates: candidates(STUDENTS) })
    const first = await runDailyDigest(server.client, NOW)
    expect(first.digestsSent).toBe(STUDENTS)
    expect(sentEmails).toHaveLength(STUDENTS)

    // 40 notification rows now exist for this (tenant, kind, day). Read
    // unpaged, the idempotency check would see only 7 of them and re-send to
    // the other 33 — a cron retry duplicating a day's digests.
    sentEmails.length = 0
    const second = await runDailyDigest(server.client, NOW)

    expect(second.errors).toEqual([])
    expect(second.digestsSent).toBe(0)
    expect(second.emailsSent).toBe(0)
    expect(second.skippedAlreadySent).toBe(STUDENTS)
    expect(sentEmails).toEqual([])
    expect(server.requestsFor('notifications')).toBeGreaterThan(1)
  })

  it('#548 acceptance: a student with email disabled is not emailed, even past the cap', async () => {
    // Index 30 sits well beyond the 7-row cap, so an unpaged preferences read
    // never sees this row and `resolveChannels(undefined)` defaults them back
    // to email:true — opting out would be silently reversed by truncation.
    const optedOut = 30
    const preferences = Array.from({ length: STUDENTS }, (_, i) => ({
      id: i,
      user_id: userId(i),
      in_app_enabled: true,
      email_enabled: i !== optedOut,
      email_frequency: 'immediate',
    }))
    const { client, requestsFor } = makeServer({ serverCap: CAP, candidates: candidates(STUDENTS), preferences })

    const result = await runDailyDigest(client, NOW)

    expect(result.errors).toEqual([])
    // The preference read really was capped — 40 rows over 7-row responses.
    expect(requestsFor('notification_preferences')).toBeGreaterThan(1)
    expect(sentEmails.map((e) => e.to)).not.toContain(emailFor(optedOut))
    expect(result.emailsSent).toBe(STUDENTS - 1)
    // Still gets the in-app notification — only the email channel was declined.
    expect(result.digestsSent).toBe(STUDENTS)
  })

  it('#548: honours email_frequency "never" past the cap as well', async () => {
    const silent = 35
    const preferences = Array.from({ length: STUDENTS }, (_, i) => ({
      id: i,
      user_id: userId(i),
      in_app_enabled: true,
      email_enabled: true,
      email_frequency: i === silent ? 'never' : 'immediate',
    }))
    const { client } = makeServer({ serverCap: CAP, candidates: candidates(STUDENTS), preferences })

    const result = await runDailyDigest(client, NOW)
    expect(sentEmails.map((e) => e.to)).not.toContain(emailFor(silent))
    expect(result.emailsSent).toBe(STUDENTS - 1)
  })

  it('skips the tenant rather than emailing everyone when the preferences read fails', async () => {
    // Falling through with an empty preferences map would mean "nobody has
    // opted out" — the failure mode must be sending nothing, not sending all.
    const { client } = makeServer({ serverCap: CAP, candidates: candidates(STUDENTS), failPreferences: true })
    const result = await runDailyDigest(client, NOW)

    expect(result.digestsSent).toBe(0)
    expect(sentEmails).toEqual([])
    expect(result.errors.join(' ')).toMatch(/preferences read failed/)
  })

  it('spans multiple tenants, each read completely', async () => {
    const other = '00000000-0000-0000-0000-0000000000bb'
    const { client } = makeServer({
      serverCap: CAP,
      candidates: [...candidates(STUDENTS), ...candidates(STUDENTS, other)],
      tenants: [
        { id: TENANT, name: 'Cap School', slug: 'cap' },
        { id: other, name: 'Other School', slug: 'other' },
      ],
    })

    const result = await runDailyDigest(client, NOW)
    expect(result.tenantsConsidered).toBe(2)
    expect(result.tenantsProcessed).toBe(2)
    expect(result.digestsSent).toBe(STUDENTS * 2)
  })
})
