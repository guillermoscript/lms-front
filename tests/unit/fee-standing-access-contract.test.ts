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

  /**
   * The sales gate (#929 step 4, hardened in 20261009120000) mentions
   * `entitlements` only on the NEW-grant side — grant_free_entitlement() and
   * self_enroll_subscription_course() refuse a NEW grant while blocked, and
   * free_enrollment_allowed() / subscription_enrollment_allowed() read whether
   * the student ALREADY holds the course. Originally: grant_free_entitlement() refuses a new free
   * enrollment while blocked, and free_enrollment_allowed() reads whether the
   * student ALREADY holds the course (so re-clicking stays allowed). Neither
   * can revoke or edit an existing grant; the next test pins that down.
   */
  const NEW_GRANT_GATE_ONLY: Record<string, string> = {
    '20261009110000_platform_fee_gate_929.sql': 'gates NEW free grants only (grant_free_entitlement)',
    '20261009120000_platform_fee_hardening_929.sql':
      'gates NEW subscription course choices only (self_enroll_subscription_course); re-enrolling a held course stays allowed',
  }

  it('no migration that touches the fee ledger redefines course access or entitlements', () => {
    const offenders = files.filter((f) => {
      const sql = read(f)
      if (!FEE_OBJECTS.test(sql)) return false
      if (/has_course_access/i.test(sql)) return true
      return f in NEW_GRANT_GATE_ONLY ? false : /\bentitlements\b/i.test(sql)
    })
    expect(offenders).toEqual([])
  })

  it('the new-grant gate never revokes, edits or deletes an existing entitlement', () => {
    for (const f of Object.keys(NEW_GRANT_GATE_ONLY)) {
      const sql = read(f)
      expect(sql, f).not.toMatch(/UPDATE\s+(?:public\.)?entitlements\b/i)
      expect(sql, f).not.toMatch(/DELETE\s+FROM\s+(?:public\.)?entitlements\b/i)
      expect(sql, f).not.toMatch(/\bON\s+(?:public\.)?entitlements\b/i)
      // The only entitlement write is grant_free_entitlement's own INSERT,
      // whose ON CONFLICT re-activates the caller's free grant (unchanged body).
      expect(sql.match(/INSERT\s+INTO\s+(?:public\.)?entitlements\b/gi) ?? [], f).toHaveLength(1)
    }
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
