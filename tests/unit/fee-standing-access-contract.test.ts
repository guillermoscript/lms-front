/**
 * D5 contract (#929, docs/PLATFORM_FEE_LEDGER_DESIGN.md 4.2): a school's
 * platform fee standing may stop NEW sales, never a paying student's access.
 * Course access and entitlements must not depend on any fee-ledger object.
 * This is deliberately not the access_cutoff_at mechanism, which does revoke.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '../../supabase/migrations')
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
const read = (f: string) => readFileSync(join(DIR, f), 'utf8')

const FEE_OBJECTS = /tenant_fee_standing|is_tenant_sales_blocked|platform_fee_|reevaluate_tenant_fee_standing|sales_blocked/i

/** Body of the LAST definition of `fn` across all migrations (the live one). */
function latestDefinition(fn: string): { file: string; body: string } {
  const head = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(`, 'gi')
  let found: { file: string; body: string } | null = null
  for (const f of files) {
    const sql = read(f)
    for (const m of sql.matchAll(head)) {
      const rest = sql.slice(m.index!)
      const tag = rest.match(/AS\s+(\$[a-z_]*\$)/i)
      if (!tag) continue
      const start = rest.indexOf(tag[1]) + tag[1].length
      const end = rest.indexOf(tag[1], start)
      found = { file: f, body: rest.slice(0, end > 0 ? end : undefined) }
    }
  }
  if (!found) throw new Error(`no definition of ${fn} found`)
  return found
}

describe('D5: fee standing never gates course access', () => {
  it('the live has_course_access does not read any fee-ledger object', () => {
    const { body } = latestDefinition('has_course_access')
    expect(body).toMatch(/entitlements/)
    expect(body).not.toMatch(FEE_OBJECTS)
  })

  it('no migration that touches the fee ledger redefines course access or entitlements', () => {
    const offenders = files.filter((f) => {
      const sql = read(f)
      return FEE_OBJECTS.test(sql) && /has_course_access|\bentitlements\b/i.test(sql)
    })
    expect(offenders).toEqual([])
  })

  it('no entitlements policy, trigger or function body references fee standing', () => {
    const offenders: string[] = []
    for (const f of files) {
      const sql = read(f)
      for (const stmt of sql.split(/;\s*\n/)) {
        if (/\bON\s+(?:public\.)?entitlements\b/i.test(stmt) && FEE_OBJECTS.test(stmt)) offenders.push(f)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the foundation migration exists and creates the standing table (guards the greps above)', () => {
    const sql = read('20261009100000_platform_fee_ledger_929.sql')
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.tenant_fee_standing/)
  })
})
