import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase, type Db } from './support/fake-supabase'
import { reconcileAccessCutoff, reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'

/**
 * Coverage for `reconcileAccessCutoff` — the impure half of the module, and the
 * function that actually enforces #494/#517 (issue #550).
 *
 * The existing suites only reach the pure helpers: `access-cutoff.test.ts`
 * imports `decideAccessCutoffAction`, `access-cutoff-notifications.test.ts` the
 * three ladder helpers. Everything stateful — the `tenants` write, the
 * three-way `effectiveCutoffAt` selection, the ledger round-trip, and the
 * delivery accounting — was untested, which is how a `return { delivered: true }`
 * sitting directly under `if (error) console.error(...)` survived review.
 *
 * These use the real-rows fake rather than canned replies because every
 * assertion here is about what a *second* call sees after the first one wrote
 * (or failed to write) — a distinction canned per-call replies cannot express.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const NOW = new Date('2026-07-01T12:00:00.000Z')
/** NOW + ACCESS_CUTOFF_GRACE_DAYS (14). */
const CUTOFF = '2026-07-15T12:00:00.000Z'

interface WorldOpts {
  /** Plan slug on the tenant row. */
  plan?: string | null
  /** Omit to simulate a `platform_plans` lookup miss (#550 §3). */
  limits?: { max_courses?: number; max_students?: number } | null
  courses?: number
  students?: number
  cutoffAt?: string | null
  ledger?: Array<{ cutoff_at: string; stage: string }>
  /** Which writes PostgREST should refuse. */
  failWrites?: (table: string, op: string) => { code: string; message: string } | null
}

function world(o: WorldOpts = {}) {
  const courses = o.courses ?? 0
  const students = o.students ?? 0

  const db: Db = {
    tenants: [
      {
        id: TENANT,
        name: 'Test School',
        plan: o.plan === undefined ? 'free' : o.plan,
        access_cutoff_at: o.cutoffAt ?? null,
      },
    ],
    platform_plans:
      o.limits === undefined
        ? [{ slug: 'free', name: 'Free', limits: { max_courses: 5, max_students: 50 } }]
        : o.limits === null
          ? []
          : [{ slug: 'free', name: 'Free', limits: o.limits }],
    courses: Array.from({ length: courses }, (_, i) => ({
      course_id: i + 1,
      tenant_id: TENANT,
      status: 'published',
    })),
    // One admin so there is always a recipient; the students follow it.
    tenant_users: [
      { user_id: 'admin-1', tenant_id: TENANT, role: 'admin', status: 'active' },
      ...Array.from({ length: students }, (_, i) => ({
        user_id: `student-${i + 1}`,
        tenant_id: TENANT,
        role: 'student',
        status: 'active',
      })),
    ],
    access_cutoff_notifications: (o.ledger ?? []).map((row) => ({
      tenant_id: TENANT,
      ...row,
    })),
  }

  const { client } = createFakeSupabase(db, {
    conflictKeys: { access_cutoff_notifications: 'stage' },
    failWrites: o.failWrites as never,
  })

  return { db, client: client as unknown as SupabaseClient }
}

/** A `sendEmail` stub that records every send and reports the given outcome. */
function mailer(result = true) {
  const sent: string[] = []
  const fn = (async ({ to, subject }: { to: string; subject: string }) => {
    sent.push(`${to}|${subject}`)
    return result
  }) as never
  return { sent, fn }
}

const tenantRow = (db: Db) => db.tenants[0]

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // The module logs loudly on every failure path under test; silence it so a
  // green run is readable, but keep the spy so we can assert it fired.
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('reconcileAccessCutoff — scheduling and clearing', () => {
  it('schedules a cutoff 14 days out and sends the `scheduled` rung', async () => {
    const { db, client } = world({ courses: 9, limits: { max_courses: 5, max_students: 50 } })
    const mail = mailer()

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })

    expect(decision.action).toBe('schedule')
    expect(decision.cutoffAt).toBe(CUTOFF)
    expect(decision.notifiedStage).toBe('scheduled')
    expect(tenantRow(db).access_cutoff_at).toBe(CUTOFF)
    expect(mail.sent).toHaveLength(1)
    expect(db.access_cutoff_notifications).toHaveLength(1)
    expect(db.access_cutoff_notifications[0]).toMatchObject({
      cutoff_at: CUTOFF,
      stage: 'scheduled',
      recipient_count: 1,
    })
  })

  it('clears a live cutoff once usage is back under the limit, and sends nothing', async () => {
    const { db, client } = world({
      courses: 3,
      limits: { max_courses: 5, max_students: 50 },
      cutoffAt: CUTOFF,
      ledger: [{ cutoff_at: CUTOFF, stage: 'scheduled' }],
    })
    const mail = mailer()

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })

    expect(decision.action).toBe('clear')
    expect(tenantRow(db).access_cutoff_at).toBeNull()
    expect(mail.sent).toEqual([])
  })

  it('is idempotent while still over the limit — no re-scheduling, no second email', async () => {
    const { db, client } = world({
      courses: 9,
      limits: { max_courses: 5, max_students: 50 },
      cutoffAt: CUTOFF,
      ledger: [{ cutoff_at: CUTOFF, stage: 'scheduled' }],
    })
    const mail = mailer()

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })

    expect(decision.action).toBe('none')
    expect(decision.notifiedStage).toBeUndefined()
    expect(tenantRow(db).access_cutoff_at).toBe(CUTOFF)
    expect(mail.sent).toEqual([])
  })

  it('counts students the same way the limit does, and schedules on the student limit', async () => {
    const { db, client } = world({ students: 4, limits: { max_courses: 100, max_students: 3 } })
    const mail = mailer()

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })

    expect(decision.action).toBe('schedule')
    expect(tenantRow(db).access_cutoff_at).toBe(CUTOFF)
    // The admin is not a student and must not be counted into the violation.
    expect(mail.sent[0]).toContain('admin-1@example.com')
  })

  it('does nothing at all for a tenant that does not exist', async () => {
    const { client } = world()
    await expect(
      reconcileAccessCutoff(client, 'no-such-tenant', { now: NOW })
    ).resolves.toEqual({ action: 'none' })
  })
})

describe('reconcileAccessCutoff — ledger write failure (#550 §2)', () => {
  const failLedger = (table: string, op: string) =>
    table === 'access_cutoff_notifications' && op === 'upsert'
      ? { code: '42501', message: 'new row violates row-level security policy' }
      : null

  it('reports notifyFailed, not notifiedStage, when the ledger write is refused', async () => {
    const { db, client } = world({
      courses: 9,
      limits: { max_courses: 5, max_students: 50 },
      failWrites: failLedger,
    })
    const mail = mailer()

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })

    // The email really did go out — the failure is that nothing recorded it.
    expect(mail.sent).toHaveLength(1)
    expect(decision.notifiedStage).toBeUndefined()
    expect(decision.notifyFailed).toBe(true)
    expect(db.access_cutoff_notifications).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('never reports a repeated send as delivered — the cron counts it under notifyFailures', async () => {
    // The regression this whole issue is named for: run the sweep twice against
    // a ledger that cannot be written. The rung is re-derived and re-sent (that
    // is the accepted cost of a failing ledger), but it must NEVER come back as
    // `notifiedStage`, because the cron reads that as a healthy delivery and the
    // run looks fine while every admin gets the same email daily forever.
    const { client } = world({
      courses: 9,
      limits: { max_courses: 5, max_students: 50 },
      failWrites: failLedger,
    })
    const mail = mailer()

    const first = await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })
    const second = await reconcileAccessCutoff(client, TENANT, {
      now: new Date('2026-07-02T12:00:00.000Z'),
      sendEmailFn: mail.fn,
      notifyDueStages: true,
    })

    expect(first.notifyFailed).toBe(true)
    expect(second.notifyFailed).toBe(true)
    expect(first.notifiedStage).toBeUndefined()
    expect(second.notifiedStage).toBeUndefined()
    expect(mail.sent).toHaveLength(2)
  })

  it('a successful ledger write stops the second sweep from re-sending', async () => {
    // The contrast case that proves the retry above is driven by the ledger and
    // not by the decision branch.
    const { db, client } = world({ courses: 9, limits: { max_courses: 5, max_students: 50 } })
    const mail = mailer()

    await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })
    const second = await reconcileAccessCutoff(client, TENANT, {
      now: new Date('2026-07-02T12:00:00.000Z'),
      sendEmailFn: mail.fn,
      notifyDueStages: true,
    })

    expect(second.notifiedStage).toBeUndefined()
    expect(second.notifyFailed).toBeUndefined()
    expect(mail.sent).toHaveLength(1)
    expect(db.access_cutoff_notifications).toHaveLength(1)
  })

  it('a send nobody received is not recorded and not reported as delivered', async () => {
    const { db, client } = world({ courses: 9, limits: { max_courses: 5, max_students: 50 } })
    const mail = mailer(false)

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })

    expect(decision.action).toBe('schedule')
    expect(decision.notifyFailed).toBe(true)
    expect(db.access_cutoff_notifications).toEqual([])
    // The cutoff itself is still scheduled — a mail outage must not postpone
    // enforcement, only the announcement of it.
    expect(tenantRow(db).access_cutoff_at).toBe(CUTOFF)
  })
})

describe('reconcileAccessCutoff — schedule branch consults the ledger (#550 §2)', () => {
  it('does not re-send `scheduled` when the ledger already holds it for this cutoff', async () => {
    // The cron/plan-change race: the cutoff row was cleared and re-set to the
    // same timestamp with the rung already recorded. The old code forced
    // `'scheduled'` outright and put a second identical email in every inbox.
    const { client } = world({
      courses: 9,
      limits: { max_courses: 5, max_students: 50 },
      ledger: [{ cutoff_at: CUTOFF, stage: 'scheduled' }],
    })
    const mail = mailer()

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })

    expect(decision.action).toBe('schedule')
    expect(decision.notifiedStage).toBeUndefined()
    expect(mail.sent).toEqual([])
  })

  it('starts a fresh ladder when the cutoff is rescheduled to a new timestamp', async () => {
    // The ledger is keyed on `cutoff_at`, so a stale rung from a previous
    // deadline must not suppress the new one.
    const { client } = world({
      courses: 9,
      limits: { max_courses: 5, max_students: 50 },
      ledger: [{ cutoff_at: '2026-01-01T00:00:00.000Z', stage: 'scheduled' }],
    })
    const mail = mailer()

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW, sendEmailFn: mail.fn })

    expect(decision.notifiedStage).toBe('scheduled')
    expect(mail.sent).toHaveLength(1)
  })

  it('sends the due rung only when the sweep asks for it', async () => {
    const opts = {
      courses: 9,
      limits: { max_courses: 5, max_students: 50 },
      cutoffAt: CUTOFF,
      ledger: [{ cutoff_at: CUTOFF, stage: 'scheduled' }],
    }
    // T-1 day: `reminder_1d` is reached and unsent.
    const oneDayOut = new Date('2026-07-14T13:00:00.000Z')

    const quiet = world(opts)
    const quietMail = mailer()
    const withoutFlag = await reconcileAccessCutoff(quiet.client, TENANT, {
      now: oneDayOut,
      sendEmailFn: quietMail.fn,
    })
    expect(withoutFlag.notifiedStage).toBeUndefined()
    expect(quietMail.sent).toEqual([])

    const sweep = world(opts)
    const sweepMail = mailer()
    const withFlag = await reconcileAccessCutoff(sweep.client, TENANT, {
      now: oneDayOut,
      sendEmailFn: sweepMail.fn,
      notifyDueStages: true,
    })
    expect(withFlag.notifiedStage).toBe('reminder_1d')
    expect(sweepMail.sent).toHaveLength(1)
  })
})

describe('reconcileAccessCutoff — unknown plan limits (#550 §3)', () => {
  it('leaves a live cutoff standing when the platform_plans row is missing', async () => {
    const { db, client } = world({ courses: 9, limits: null, cutoffAt: CUTOFF })

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW })

    expect(decision.action).toBe('none')
    expect(tenantRow(db).access_cutoff_at).toBe(CUTOFF)
  })

  it('still refuses to schedule new enforcement off limits it could not read', async () => {
    const { db, client } = world({ courses: 9, limits: null, cutoffAt: null })

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW })

    expect(decision.action).toBe('none')
    expect(tenantRow(db).access_cutoff_at).toBeNull()
  })

  it('clears normally as soon as the plan row is readable again', async () => {
    const { db, client } = world({
      courses: 3,
      limits: { max_courses: 5, max_students: 50 },
      cutoffAt: CUTOFF,
    })

    const decision = await reconcileAccessCutoff(client, TENANT, { now: NOW })

    expect(decision.action).toBe('clear')
    expect(tenantRow(db).access_cutoff_at).toBeNull()
  })
})

describe('reconcileAccessCutoffSafely (#550 §1)', () => {
  it('clears the cutoff on the usage-reduction path', async () => {
    const { db, client } = world({
      courses: 3,
      limits: { max_courses: 5, max_students: 50 },
      cutoffAt: CUTOFF,
    })

    await reconcileAccessCutoffSafely(client, TENANT)

    expect(tenantRow(db).access_cutoff_at).toBeNull()
  })

  it('swallows and logs a reconcile failure rather than failing the caller', async () => {
    // The archive already succeeded by the time this runs. Throwing here would
    // punish the school for doing exactly what the cutoff email asked.
    const exploding = {
      from: () => {
        throw new Error('connection reset')
      },
    } as unknown as SupabaseClient

    await expect(reconcileAccessCutoffSafely(exploding, TENANT)).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })
})
