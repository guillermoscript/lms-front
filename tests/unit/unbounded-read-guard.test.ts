import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Review guard against the next unbounded sweep (issue #548).
 *
 * PostgREST caps every response at the API "Max rows" setting and returns the
 * capped result as an ordinary 200 (`supabase/config.toml:18`). Truncation is
 * therefore invisible: `#533` found it after a school was underpaid, `#548`
 * after finding that a truncated preferences read emails students who opted
 * out. Neither was caught by a test, because on a development dataset every
 * one of these reads is complete.
 *
 * So the check has to be static. This walks the source tree, pulls out every
 * PostgREST chain against a table whose row count grows with usage, and fails
 * on any that reads without bounding itself. New violations fail; the ones
 * that already existed are listed in `KNOWN_UNBOUNDED` with a reason, so the
 * baseline is a ratchet rather than a blanket.
 *
 * A chain counts as bounded if it pages (`.range(`, which is what
 * `fetchAllRows`/`fetchAllRowsIn` callers use), asks for one row
 * (`.single(`/`.maybeSingle(`), takes a fixed slice (`.limit(`), or wants only
 * a count (`head: true`).
 */

const ROOTS = ['app', 'lib', 'components']
const SOURCE_EXTENSIONS = ['.ts', '.tsx']

/**
 * Tables whose row count grows with tenant activity — one row per sale, per
 * enrolment, per notification. These are the ones where "it works locally"
 * says nothing at all about production.
 */
const UNBOUNDED_PRONE_TABLES = [
  'transactions',
  'payouts',
  'notifications',
  'notification_preferences',
  'user_notifications',
  'subscriptions',
  'platform_subscriptions',
  'entitlements',
  'enrollments',
  'tenants',
]

const BOUNDING_TOKENS = ['.range(', '.single(', '.maybeSingle(', '.limit(', 'head: true']

/**
 * Pre-existing reads, recorded when the guard was added. Each is `file::table`.
 *
 * Two kinds, and the distinction matters:
 *  - `scoped` — filtered to one user, one course or one row, so the result set
 *    is bounded by something other than luck.
 *  - `gap` — genuinely unbounded platform- or tenant-wide sweeps, the same
 *    class of bug as #533/#548 and not yet fixed. Tracked in epic #540; listed
 *    here so they are visible rather than forgotten.
 *
 * Fixing one means deleting its line — the test fails on a stale entry, so the
 * list cannot quietly rot.
 */
const KNOWN_UNBOUNDED: Record<string, string> = {
  // scoped: a single user's own rows
  'app/[locale]/dashboard/student/billing/page.tsx::transactions': 'scoped — one user’s own purchases',
  'app/[locale]/dashboard/student/billing/page.tsx::subscriptions': 'scoped — one user’s own subscriptions',
  'app/[locale]/dashboard/student/courses/page.tsx::enrollments': 'scoped — one user’s enrolments',
  'app/[locale]/dashboard/student/page.tsx::enrollments': 'scoped — one user’s enrolments',
  'app/[locale]/dashboard/student/progress/page.tsx::enrollments': 'scoped — one user’s enrolments',
  'app/[locale]/dashboard/admin/users/[userId]/page.tsx::enrollments': 'scoped — one user’s enrolments',
  'lib/hooks/use-course-access.ts::entitlements': 'scoped — one user’s entitlements',
  'lib/services/course-access.ts::entitlements': 'scoped — one user’s entitlements',
  'lib/payments/subscription-guard.ts::subscriptions': 'scoped — one user’s subscriptions',

  // scoped: one course (large, but bounded by a course roster)
  'app/[locale]/dashboard/teacher/courses/[courseId]/page.tsx::enrollments': 'scoped — one course roster',
  'app/[locale]/dashboard/teacher/courses/[courseId]/certificates/page.tsx::enrollments': 'scoped — one course roster',
  'app/actions/teacher/courses.ts::enrollments': 'scoped — one course roster',
  'app/actions/admin/notifications.ts::enrollments': 'scoped — one course roster',

  // gap: tenant- or platform-wide sweeps, #533 class, not in #548's scope
  'app/[locale]/dashboard/admin/analytics/page.tsx::transactions': 'gap #540 — tenant-wide, summed',
  'app/[locale]/dashboard/admin/analytics/page.tsx::enrollments': 'gap #540 — tenant-wide, counted',
  'app/[locale]/dashboard/admin/page.tsx::transactions': 'gap #540 — tenant-wide, summed',
  'app/[locale]/dashboard/admin/courses/page.tsx::enrollments': 'gap #540 — tenant-wide, counted',
  'app/[locale]/dashboard/admin/enrollments/page.tsx::enrollments': 'gap #540 — tenant-wide listing',
  'app/[locale]/dashboard/admin/users/page.tsx::enrollments': 'gap #540 — tenant-wide, counted',
  'app/[locale]/dashboard/admin/subscriptions/page.tsx::subscriptions': 'gap #540 — tenant-wide listing',
  'app/[locale]/dashboard/admin/transactions/page.tsx::transactions': 'gap #540 — tenant-wide listing',
  'app/[locale]/dashboard/admin/tenants/page.tsx::tenants': 'gap #540 — platform-wide listing',
  'app/[locale]/dashboard/teacher/page.tsx::enrollments': 'gap #540 — tenant-wide, counted',
  'app/actions/admin/binance-personal.ts::transactions': 'gap #540 — tenant-wide reconcile list',
  'app/api/cron/binance-personal-reconcile/route.ts::transactions': 'gap #540 — platform-wide cron queue',
  'app/api/cron/expire-subscriptions/route.ts::subscriptions': 'gap #540 — platform-wide cron queue',
  'app/api/cron/expire-platform-subscriptions/route.ts::platform_subscriptions': 'gap #540 — platform-wide cron queue',
  'app/api/stripe/webhook/route.ts::transactions': 'gap #540 — platform-wide pending scan',

  // scoped: tenant_id is the table's unique key, so the transition-guarded
  // past_due update returns at most one row — its .select() is the proof the
  // WHERE actually flipped the row, not a listing.
  'lib/billing/platform-webhook-dispatch.ts::platform_subscriptions':
    'scoped — one tenant’s single row (unique tenant_id)',
}

/** Every source file under the scanned roots. */
function sourceFiles(): string[] {
  const out: string[] = []
  for (const root of ROOTS) {
    let entries: string[]
    try {
      entries = readdirSync(root, { recursive: true }) as string[]
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(root, entry)
      if (SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))) out.push(path)
    }
  }
  return out
}

/**
 * Pull out each `.from('table')…` chain as raw text.
 *
 * The chain runs until the expression ends: a bracket that closes something
 * opened outside it, a `,`/`;` at depth zero, or a newline whose next
 * non-space character is not `.` (so a broken-up fluent chain stays one
 * chain). Crude next to a real parser, and deliberately so — it only has to be
 * good enough to spot a `.select()` that never bounds itself.
 */
export function extractChains(source: string): Array<{ table: string; text: string }> {
  const chains: Array<{ table: string; text: string }> = []
  const fromCall = /\.from\(\s*['"]([a-z_]+)['"]\s*\)/g
  let match: RegExpExecArray | null

  while ((match = fromCall.exec(source))) {
    let index = match.index + match[0].length
    let depth = 0
    let end = index

    while (index < source.length) {
      const char = source[index]
      if ('([{'.includes(char)) depth++
      else if (')]}'.includes(char)) {
        if (depth === 0) break
        depth--
      } else if (depth === 0 && (char === ';' || char === ',')) break
      else if (depth === 0 && char === '\n') {
        const rest = source.slice(index + 1)
        const indent = rest.match(/^[ \t]*/)![0].length
        if (rest[indent] !== '.') break
      }
      index++
      end = index
    }
    chains.push({ table: match[1], text: source.slice(match.index, end) })
  }
  return chains
}

/** A read against a growth table that bounds itself in none of the accepted ways. */
export function isUnboundedRead(chain: { table: string; text: string }): boolean {
  if (!UNBOUNDED_PRONE_TABLES.includes(chain.table)) return false
  if (!chain.text.includes('.select(')) return false
  return !BOUNDING_TOKENS.some((token) => chain.text.includes(token))
}

function scanRepository(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const file of sourceFiles()) {
    for (const chain of extractChains(readFileSync(file, 'utf8'))) {
      if (!isUnboundedRead(chain)) continue
      const key = `${file}::${chain.table}`
      found.set(key, [...(found.get(key) ?? []), chain.text.replace(/\s+/g, ' ').slice(0, 120)])
    }
  }
  return found
}

describe('unbounded read guard', () => {
  it('finds no unbounded read that is not already accounted for', () => {
    const offenders = [...scanRepository().entries()]
      .filter(([key]) => !(key in KNOWN_UNBOUNDED))
      .map(([key, samples]) => `${key}\n      ${samples[0]}`)

    expect(
      offenders,
      'New unbounded read on a growth table. PostgREST silently caps it at the API row ' +
        'limit, so any total computed from it is wrong and no error is raised. Page it with ' +
        'fetchAllRows (or fetchAllRowsIn for .in() lookups) plus a primary-key .order(), or ' +
        'bound it with .limit()/.single(). If it is genuinely scoped, add it to ' +
        'KNOWN_UNBOUNDED with the reason.'
    ).toEqual([])
  })

  it('keeps the known-unbounded list honest — no entry that no longer applies', () => {
    const live = scanRepository()
    const stale = Object.keys(KNOWN_UNBOUNDED).filter((key) => !live.has(key))
    expect(stale, 'Fixed (or moved) — delete these lines from KNOWN_UNBOUNDED.').toEqual([])
  })

  it('#548: the reads this issue fixed no longer register as unbounded', () => {
    const live = scanRepository()
    const fixed = [
      'app/[locale]/dashboard/admin/payouts/page.tsx::payouts',
      'app/[locale]/dashboard/teacher/revenue/page.tsx::transactions',
      'app/actions/admin/revenue.ts::transactions',
      'app/actions/platform/billing-health.ts::tenants',
      'app/actions/platform/billing-health.ts::platform_subscriptions',
      'lib/notifications/daily-digest.ts::notification_preferences',
      'lib/notifications/daily-digest.ts::notifications',
      'lib/notifications/daily-digest.ts::tenants',
      'app/api/cron/solana-reconcile/route.ts::transactions',
      'app/api/cron/solana-pull/route.ts::subscriptions',
    ]
    expect(fixed.filter((key) => live.has(key))).toEqual([])
  })
})

/**
 * The guard is worthless if the extractor quietly stops matching anything —
 * a scan that finds nothing looks identical to a clean repository.
 */
describe('unbounded read guard — the detector itself', () => {
  it('flags a bare tenant-wide select', () => {
    const [chain] = extractChains(`
      const { data } = await supabase
        .from('transactions')
        .select('amount')
        .eq('tenant_id', tenantId)
    `)
    expect(chain.table).toBe('transactions')
    expect(isUnboundedRead(chain)).toBe(true)
  })

  it.each(BOUNDING_TOKENS)('accepts a read bounded by %s', (token) => {
    const call = token === 'head: true' ? ".select('*', { count: 'exact', head: true })" : `.select('*')${token})`
    const [chain] = extractChains(`await supabase.from('transactions')${call}`)
    expect(isUnboundedRead(chain)).toBe(false)
  })

  it('ignores tables that do not grow with usage', () => {
    const [chain] = extractChains(`await supabase.from('plans').select('*')`)
    expect(isUnboundedRead(chain)).toBe(false)
  })

  it('ignores a write that never reads rows back', () => {
    const [chain] = extractChains(`await supabase.from('transactions').update({ status: 'failed' }).eq('id', id)`)
    expect(isUnboundedRead(chain)).toBe(false)
  })

  it('keeps a chain broken across lines together', () => {
    const [chain] = extractChains(`
      await supabase
        .from('payouts')
        .select('amount')
        .eq('tenant_id', t)
        .limit(10)
    `)
    expect(isUnboundedRead(chain)).toBe(false)
  })

  it('stops at the end of the expression rather than swallowing the next statement', () => {
    const [first] = extractChains(`
      const a = await supabase.from('transactions').select('amount')
      const b = await supabase.from('payouts').select('amount').limit(1)
    `)
    // Without a boundary the `.limit(1)` below would mark this one bounded.
    expect(first.text).not.toContain('limit')
    expect(isUnboundedRead(first)).toBe(true)
  })

  it('actually walks the repository — the scan is not silently empty', () => {
    expect(sourceFiles().length).toBeGreaterThan(100)
    expect(scanRepository().size).toBeGreaterThan(0)
  })
})
