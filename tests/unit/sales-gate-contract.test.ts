import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { IN_FLIGHT_MAX_AGE_DAYS, SELF_MANAGED_RENEWAL_WINDOW_DAYS } from '@/lib/billing/sales-gate-constants'
import { SALES_BLOCKED_SQLSTATE } from '@/lib/billing/sales-block-error'

/**
 * Issue #929 — a NEW sale cannot be written without passing the fee sales gate.
 *
 * Every `transactions` insert and every free self-enroll RPC call in app/,
 * lib/, components/ and mcp-server/src must be preceded by
 * `assertSalesOpen(` (or `isSalesOpen(`) inside the same function, so a
 * blocked school is refused with friendly copy before any provider session or
 * pending row exists. The DB trigger (LM003) is still the authoritative layer;
 * this keeps the UX layer from silently missing a new insert site. Adding an
 * insert without the pre-check fails this test, which is the point.
 */

const root = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const files = ['app', 'lib', 'components', 'mcp-server/src'].flatMap((d) => walk(join(root, d)))

/** Writes that create a NEW sale or a new free enrollment. */
const SALE_WRITE = new RegExp(
  [
    String.raw`\.from\(\s*['"]transactions['"]\s*\)\s*\.(?:insert|upsert)\(`,
    String.raw`\.rpc\(\s*['"](?:grant_free_subscription|grant_free_entitlement)['"]`,
  ].join('|'),
  'g',
)

interface Site {
  file: string
  line: number
  gated: boolean
}

function findSites(): Site[] {
  const sites: Site[] = []
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    let previousWrite = 0
    for (const match of src.matchAll(SALE_WRITE)) {
      const at = match.index ?? 0
      // Enclosing function: the nearest `function` keyword before the write.
      // A second write in the same function needs its OWN pre-check, so the
      // window also starts after the previous write.
      const fnStart = src.lastIndexOf('function ', at)
      const body = src.slice(Math.max(fnStart, previousWrite, 0), at)
      previousWrite = at + match[0].length
      sites.push({
        file: relative(root, file),
        line: src.slice(0, at).split('\n').length,
        gated: /\b(?:assertSalesOpen|isSalesOpen)\(/.test(body),
      })
    }
  }
  return sites
}

const sites = findSites()

describe('fee sales gate contract (#929)', () => {
  it('finds the known sale-write sites (detector is alive)', () => {
    const where = new Set(sites.map((s) => s.file))
    for (const f of [
      'app/[locale]/(public)/checkout/actions.ts',
      'app/actions/payment-requests.ts',
      'app/api/payments/checkout/route.ts',
      'app/api/stripe/create-payment-intent/route.ts',
    ]) {
      expect(where, f).toContain(f)
    }
    // 5 transactions inserts + grant_free_subscription + grant_free_entitlement.
    expect(sites.length).toBeGreaterThanOrEqual(7)
  })

  for (const site of sites) {
    it(`${site.file}:${site.line} calls assertSalesOpen before the write`, () => {
      expect(site.gated, `${site.file}:${site.line} writes a new sale without assertSalesOpen()`).toBe(true)
    })
  }

  const gateSql = readFileSync(join(root, 'supabase/migrations/20261009110000_platform_fee_gate_929.sql'), 'utf8')

  it('SQL and TS renewal constants agree', () => {
    const sqlConst = (fn: string) => {
      const m = gateSql.match(new RegExp(`FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?\\$function\\$ SELECT (\\d+) \\$function\\$`))
      return m ? Number(m[1]) : NaN
    }
    expect(sqlConst('fee_gate_self_managed_renewal_window_days')).toBe(SELF_MANAGED_RENEWAL_WINDOW_DAYS)
    expect(sqlConst('fee_gate_in_flight_max_age_days')).toBe(IN_FLIGHT_MAX_AGE_DAYS)
  })

  it('the trigger raises the SQLSTATE isSalesBlockedError maps', () => {
    expect(gateSql).toContain(`ERRCODE = '${SALES_BLOCKED_SQLSTATE}'`)
    expect(gateSql).toContain(`'sales_blocked:fees'`)
  })

  it('the gate is INSERT-only and never touches course access (D5)', () => {
    expect(gateSql).toMatch(/BEFORE INSERT ON public\.transactions/)
    expect(gateSql).not.toMatch(/BEFORE UPDATE ON public\.transactions/)
    expect(gateSql).not.toMatch(/FUNCTION public\.has_course_access/)
    expect(gateSql).not.toMatch(/UPDATE public\.entitlements/i)
  })
})
