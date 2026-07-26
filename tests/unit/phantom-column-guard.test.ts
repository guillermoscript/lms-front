import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Review guard against the next phantom column (issue #547 §2).
 *
 * `transactions` has `transaction_date`. Two shipped revenue screens asked for
 * `created_at`, which does not exist on it. PostgREST rejects the whole request
 * with 42703, and neither call site checked the error — so
 * `/dashboard/admin/analytics` showed **$0.00 revenue and a count of 0 on every
 * render, for every school, permanently, with nothing logged**, and
 * `/dashboard/teacher/revenue` 500'd once #548 moved it onto `fetchAllRows`.
 *
 * Nothing caught it. TypeScript could not: the rows come back from PostgREST as
 * `any`-ish data and the column name lives inside a string. The unit suite could
 * not: no test rendered those pages. It survived a code review and a whole
 * payout-accuracy epic sitting in plain sight.
 *
 * So, like `unbounded-read-guard.test.ts`, the check has to be static. This
 * walks the source, pulls every column name a PostgREST chain mentions for the
 * money tables, and asserts each one actually exists in `lib/database.types.ts`
 * — the generated schema. A column that is not there cannot be queried, and now
 * cannot be committed either.
 *
 * Deliberately narrow: only the tables where a silently-wrong number is money,
 * only plain column tokens (embeds, aliases and FK hints are skipped rather
 * than half-parsed). A guard that cries wolf gets deleted.
 */

const ROOTS = ['app', 'lib', 'components']
const SOURCE_EXTENSIONS = ['.ts', '.tsx']

/**
 * Tables whose columns feed a currency figure. A typo in any of these reads as
 * $0.00 rather than as an error, which is exactly the failure #547 §2 was.
 */
const MONEY_TABLES = ['transactions', 'payouts', 'revenue_splits']

/** Filter/order methods that take a column name as their first argument. */
const COLUMN_ARG_METHODS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'order',
]

function sourceFiles(dir: string, acc: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      sourceFiles(full, acc)
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * Columns of one table, read out of the generated types. Parsed rather than
 * imported so the guard reads the same artifact a reviewer would check by hand.
 */
function columnsOf(table: string): Set<string> {
  const types = readFileSync('lib/database.types.ts', 'utf8')
  const start = types.indexOf(`      ${table}: {\n        Row: {\n`)
  if (start < 0) throw new Error(`table ${table} not found in database.types.ts`)
  const rowStart = types.indexOf('Row: {', start) + 'Row: {'.length
  const rowEnd = types.indexOf('\n        }', rowStart)
  const columns = new Set<string>()
  for (const line of types.slice(rowStart, rowEnd).split('\n')) {
    const match = line.match(/^\s*([a-z_][a-z0-9_]*)\??:/i)
    if (match) columns.add(match[1])
  }
  return columns
}

/**
 * Source with comments removed.
 *
 * Load-bearing, not cosmetic: both guards below ask "does this file mention X",
 * and the fix for X naturally leaves prose *about* X in a comment right next to
 * the code. Matching raw text therefore lets a file explain the bug it still
 * has — which is exactly what happened while writing these, twice.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

interface Reference {
  file: string
  table: string
  column: string
}

/**
 * Every column name a chain mentions for a money table.
 *
 * A "chain" is taken as the text from `.from('<table>')` up to the next
 * `.from(` or the end of the statement block — long enough to cover a
 * multi-line builder, short enough not to swallow the next query.
 */
function collectReferences(): Reference[] {
  const found: Reference[] = []
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, 'utf8')
      for (const table of MONEY_TABLES) {
        const fromPattern = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`, 'g')
        let match: RegExpExecArray | null
        while ((match = fromPattern.exec(source)) !== null) {
          const rest = source.slice(match.index + match[0].length)
          const nextFrom = rest.indexOf('.from(')
          const chain = nextFrom === -1 ? rest.slice(0, 1200) : rest.slice(0, nextFrom)

          // .select('a, b, c')
          const select = chain.match(/\.select\(\s*'([^']*)'/)
          if (select) {
            for (const raw of select[1].split(',')) {
              const column = raw.trim()
              // Skip anything that is not a plain column: '*', embedded
              // relations `course:courses(...)`, FK hints `profiles!fk(...)`,
              // and the `count` aggregate.
              if (!column || column.includes('(') || column.includes(':') || column.includes('!')) continue
              if (column === '*' || column === 'count') continue
              found.push({ file, table, column })
            }
          }

          // .eq('col', …) / .order('col', …) / .gte('col', …)
          const argPattern = new RegExp(`\\.(${COLUMN_ARG_METHODS.join('|')})\\(\\s*'([a-z_][a-z0-9_]*)'`, 'g')
          let argMatch: RegExpExecArray | null
          while ((argMatch = argPattern.exec(chain)) !== null) {
            found.push({ file, table, column: argMatch[2] })
          }
        }
      }
    }
  }
  return found
}

describe('phantom-column guard (#547 §2)', () => {
  it('every column these queries name actually exists on its table', () => {
    const schema = new Map(MONEY_TABLES.map((table) => [table, columnsOf(table)]))
    const violations = collectReferences()
      .filter((ref) => !schema.get(ref.table)!.has(ref.column))
      .map((ref) => `${ref.file}: ${ref.table}.${ref.column} does not exist`)

    // #547 §2 named four references across two pages. Run against the pre-fix
    // tree this guard reports SEVEN, across five: the admin dashboard's recent-
    // transactions list, the admin user-detail page and the platform tenant-
    // detail page were broken the same way and nobody had noticed, because each
    // renders its ordinary "no transactions yet" empty state on the rejected
    // query. That is the entire argument for a static guard over a reviewer.
    expect([...new Set(violations)]).toEqual([])
  })

  it('finds the columns it is supposed to be checking (the guard is not vacuous)', () => {
    // A guard that silently matches nothing passes forever. Pin that the
    // scan actually reaches the money tables and the real column names.
    const refs = collectReferences()
    expect(refs.length).toBeGreaterThan(20)
    expect(refs.some((r) => r.table === 'transactions' && r.column === 'transaction_date')).toBe(true)
    expect(refs.some((r) => r.table === 'transactions' && r.column === 'amount')).toBe(true)
    expect(refs.some((r) => r.table === 'payouts')).toBe(true)
  })

  it('would catch the exact regression: transactions has no created_at', () => {
    // The bug in one line. `payouts.created_at` DOES exist, which is part of why
    // the mistake looked plausible in review — the same identifier is correct
    // one table over.
    expect(columnsOf('transactions').has('created_at')).toBe(false)
    expect(columnsOf('transactions').has('transaction_date')).toBe(true)
    expect(columnsOf('payouts').has('created_at')).toBe(true)
  })
})

describe('applies_to_providers stays retired (#547 §3)', () => {
  it('no reader has reintroduced the stale fee predicate', () => {
    // It stored the labels 'stripe'/'manual' rather than provider slugs, so a
    // PayPal sale matched nothing and bore a 0% platform fee on the school's
    // revenue screens while `getPayoutsOwed` applied the full split to the same
    // row — two authoritative screens an entire platform fee apart. Whether a
    // fee is taken is now a provider capability (`bearsPlatformFee`), in one
    // place. Reading the column again would silently reopen the divergence.
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        // `database.types.ts` still declares the column — it exists in the
        // schema, it is just no longer read. Prose mentioning it (this fix's own
        // explanatory comments) is fine too; only a READ reopens the divergence,
        // so comments are stripped before matching.
        if (file.endsWith('database.types.ts')) continue
        if (withoutComments(readFileSync(file, 'utf8')).includes('applies_to_providers')) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})

/**
 * An accumulator line — `sum + t.amount`, `sum + Number(t.amount)`,
 * `sum + netOfRefunds(t.amount, …)`. Matched per line rather than from
 * `reduce(` onwards, because the callback's own `(sum, t) =>` closes a paren
 * and a naive `[^)]*` scan stops dead at it (which it did, silently passing).
 */
const SUMS_AMOUNT = /\bsum\s*\+[^\n]*\bamount\b/

describe('refund-aware money sums (#547 §1)', () => {
  /**
   * A partial refund leaves the row `status = 'successful'` and records the
   * slice in `refunded_amount`. Every place that SUMS `transactions.amount`
   * must therefore subtract it, or it reports money the school gave back.
   *
   * This one is a guard against the fix itself: before #547 a refund of any
   * size flipped the row to `refunded`, so a `status = 'successful'` sum was
   * complete by construction and no caller had to think about it. Making
   * partial refunds representable is what put that assumption in reach — and
   * three totals (the admin dashboard card, the admin transactions list, the
   * platform tenant-detail page) were still relying on it, found only by
   * grepping for it after the fact.
   */
  it('every file that sums transactions.amount also accounts for refunds', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const source = withoutComments(readFileSync(file, 'utf8'))
        if (!/\.from\(\s*['"`]transactions['"`]\s*\)/.test(source)) continue
        // A reduce that accumulates an `amount` — the shape every one of these
        // totals takes.
        if (!SUMS_AMOUNT.test(source)) continue
        if (source.includes('refunded_amount') || source.includes('netOfRefunds')) continue
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('is not vacuous — it recognises the totals it is meant to police', () => {
    // If the regex stops matching, the test above passes forever on an empty
    // set. Pin that the known money-summing readers are actually being seen.
    const seen: string[] = []
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const source = withoutComments(readFileSync(file, 'utf8'))
        if (!/\.from\(\s*['"`]transactions['"`]\s*\)/.test(source)) continue
        if (SUMS_AMOUNT.test(source)) seen.push(file)
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(3)
  })
})
