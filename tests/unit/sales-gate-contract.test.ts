import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { IN_FLIGHT_MAX_AGE_DAYS, SELF_MANAGED_RENEWAL_WINDOW_DAYS } from '@/lib/billing/sales-gate-constants'
import { SALES_BLOCKED_SQLSTATE } from '@/lib/billing/sales-block-error'

/**
 * Issue #929 — a NEW sale cannot be written without passing the fee sales gate.
 *
 * Every write that creates a new sale or enrollment in app/, lib/,
 * components/ and mcp-server/src must be gated:
 *
 *  - SERVER code: preceded by `assertSalesOpen(` (or `isSalesOpen(`) in the
 *    same function or an enclosing one, after any previous write in it, so a
 *    blocked school is refused with friendly copy before any provider session
 *    or pending row exists.
 *  - CLIENT code (`'use client'`) and the MCP server cannot run the
 *    service-role pre-check; the RPC itself raises LM003, so the call site must
 *    MAP it (`isSalesBlockedError(` or `LM003`) to the neutral copy.
 *
 * The DB trigger (LM003) is still the authoritative layer; this keeps the UX
 * layer from silently missing a new write site. The detector parses the code
 * (TypeScript AST), so it sees `.from('transactions' as any).insert(`, a
 * builder held in a variable (`const q = admin.from('transactions'); q.insert(`),
 * arrow-function handlers, and RPCs — including every SQL function whose
 * latest migration body inserts into `transactions`.
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
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

// ─── SQL side: functions that insert into transactions ─────────────────────

/** Latest body of every public function across the ordered migrations (DROP FUNCTION removes it). */
function latestFunctionBodies(migrations: { name: string; sql: string }[]): Map<string, string> {
  const bodies = new Map<string, string>()
  const fnRe = /\b(create\s+(?:or\s+replace\s+)?function|drop\s+function\s+(?:if\s+exists\s+)?)\s*(?:"?public"?\.)?"?(\w+)"?\s*\(/gi
  for (const { sql } of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    for (const m of sql.matchAll(fnRe)) {
      const name = m[2].toLowerCase()
      if (/^drop/i.test(m[1])) {
        bodies.delete(name)
        continue
      }
      const after = sql.slice((m.index ?? 0) + m[0].length)
      const open = after.match(/\bas\s+(\$\w*\$)/i)
      if (!open || open.index === undefined) continue
      const tag = open[1]
      const start = open.index + open[0].length
      const end = after.indexOf(tag, start)
      if (end < 0) continue
      bodies.set(name, after.slice(start, end))
    }
  }
  return bodies
}

const INSERTS_TRANSACTIONS = /\binsert\s+into\s+(?:"?public"?\.)?"?transactions"?\b/i

const migrationDir = join(root, 'supabase/migrations')
const migrations = readdirSync(migrationDir)
  .filter((f) => f.endsWith('.sql'))
  .map((name) => ({ name, sql: readFileSync(join(migrationDir, name), 'utf8') }))
const sqlBodies = latestFunctionBodies(migrations)
const SQL_TRANSACTION_WRITERS = [...sqlBodies.entries()]
  .filter(([, body]) => INSERTS_TRANSACTIONS.test(body))
  .map(([name]) => name)
  .sort()

/**
 * SQL functions that insert into `transactions` but are NOT new-sale entry
 * points an app call site must pre-gate. Each needs a reason; the trigger
 * still gates every one of them.
 */
const NOT_A_NEW_SALE: Record<string, string> = {
  // Legacy renewal helper: SECURITY INVOKER (authenticated has no INSERT on
  // transactions, #538), no app caller, and a renewal of a held subscription
  // is exempt by design 4.2a anyway.
  create_transaction_for_renewal: 'legacy renewal helper, no app caller',
}

/** RPCs that create a new sale or a new enrollment. */
const SALE_RPCS = new Set<string>([
  'grant_free_subscription',
  'grant_free_entitlement',
  'self_enroll_subscription_course',
  ...SQL_TRANSACTION_WRITERS.filter((n) => !(n in NOT_A_NEW_SALE)),
])

// ─── TS side: AST detector ─────────────────────────────────────────────────

interface Site {
  file: string
  line: number
  kind: 'insert' | 'rpc'
  client: boolean
  gated: boolean
}

const SERVER_GATE = /\b(?:assertSalesOpen|isSalesOpen)\(/
const CLIENT_GATE = /\bisSalesBlockedError\(|LM003/

function strip(e: ts.Expression): ts.Expression {
  for (;;) {
    if (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isAwaitExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      ts.isSatisfiesExpression(e)
    ) {
      e = e.expression
    } else {
      return e
    }
  }
}

function isFunctionWithBody(n: ts.Node): n is ts.FunctionLikeDeclaration {
  return (
    (ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isConstructorDeclaration(n) ||
      ts.isGetAccessorDeclaration(n) ||
      ts.isSetAccessorDeclaration(n)) &&
    !!n.body
  )
}

function detectSaleWrites(fileName: string, src: string, saleRpcs: ReadonlySet<string> = SALE_RPCS): Site[] {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const client =
    fileName.includes('mcp-server/') ||
    sf.statements.some(
      (s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === 'use client',
    )

  // Pass 1: identifiers bound to the string 'transactions' / 'rpc name'.
  const stringConsts = new Map<string, string>()
  const visitConsts = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const init = strip(n.initializer)
      if (ts.isStringLiteralLike(init)) stringConsts.set(n.name.text, init.text)
    }
    ts.forEachChild(n, visitConsts)
  }
  visitConsts(sf)
  const literal = (e: ts.Expression | undefined): string | null => {
    if (!e) return null
    const s = strip(e)
    if (ts.isStringLiteralLike(s)) return s.text
    if (ts.isIdentifier(s)) return stringConsts.get(s.text) ?? null
    return null
  }

  // Pass 2: variables holding a `.from('transactions')` builder (to a fixpoint).
  const txVars = new Set<string>()
  const isTxBuilder = (e: ts.Expression): boolean => {
    const s = strip(e)
    if (ts.isCallExpression(s) && ts.isPropertyAccessExpression(s.expression) && s.expression.name.text === 'from') {
      return literal(s.arguments[0]) === 'transactions'
    }
    return ts.isIdentifier(s) && txVars.has(s.text)
  }
  for (let changed = true; changed; ) {
    changed = false
    const visitVars = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && !txVars.has(n.name.text)) {
        if (isTxBuilder(n.initializer)) {
          txVars.add(n.name.text)
          changed = true
        }
      }
      ts.forEachChild(n, visitVars)
    }
    visitVars(sf)
  }

  // Pass 3: the writes.
  const writes: { node: ts.CallExpression; kind: 'insert' | 'rpc' }[] = []
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text
      if ((method === 'insert' || method === 'upsert') && isTxBuilder(n.expression.expression)) {
        writes.push({ node: n, kind: 'insert' })
      } else if (method === 'rpc') {
        const fn = literal(n.arguments[0])
        if (fn && saleRpcs.has(fn)) writes.push({ node: n, kind: 'rpc' })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  writes.sort((a, b) => a.node.getStart() - b.node.getStart())

  return writes.map(({ node, kind }, i) => {
    const at = node.getStart()
    const fns: ts.FunctionLikeDeclaration[] = []
    for (let p: ts.Node | undefined = node.parent; p; p = p.parent) if (isFunctionWithBody(p)) fns.push(p)
    let gated: boolean
    if (client) {
      // The DB raises LM003; the call site must map it (anywhere in its function).
      gated = fns.some((f) => CLIENT_GATE.test(f.getText()))
    } else {
      gated = fns.some((f) => {
        // A second write in the same function needs its OWN pre-check: the
        // window starts after the previous write inside this function.
        const prev = writes
          .slice(0, i)
          .map((w) => w.node)
          .filter((w) => w.getStart() >= f.getStart() && w.getEnd() <= f.getEnd())
          .pop()
        const from = Math.max(f.getStart(), prev ? prev.getEnd() : 0)
        return SERVER_GATE.test(src.slice(from, at))
      })
    }
    return {
      file: fileName,
      line: sf.getLineAndCharacterOfPosition(at).line + 1,
      kind,
      client,
      gated,
    }
  })
}

const files = ['app', 'lib', 'components', 'mcp-server/src'].flatMap((d) => walk(join(root, d)))
const sites = files.flatMap((f) => detectSaleWrites(relative(root, f), readFileSync(f, 'utf8')))

describe('fee sales gate contract (#929)', () => {
  describe('the detector', () => {
    const rpcs = new Set(['grant_free_entitlement', 'insert_sale_fn'])
    const gatedFlags = (src: string, file = 'lib/x.ts') => detectSaleWrites(file, src, rpcs).map((s) => s.gated)

    it('sees a direct insert, a cast table name and upsert', () => {
      expect(gatedFlags(`async function a(s){ await s.from('transactions').insert({}) }`)).toEqual([false])
      expect(gatedFlags(`async function a(s){ await s.from('transactions' as any).insert({}) }`)).toEqual([false])
      expect(gatedFlags(`async function a(s){ await (s.from("transactions") as any).upsert({}) }`)).toEqual([false])
      expect(gatedFlags(`const T = 'transactions'; async function a(s){ await s.from(T).insert({}) }`)).toEqual([false])
    })

    it('sees a builder held in a variable', () => {
      expect(gatedFlags(`async function a(admin){ const q = admin.from('transactions'); const r = q; await r.insert({}) }`)).toEqual([false])
      expect(
        gatedFlags(`async function a(admin){ await assertSalesOpen(t, c); const q = admin.from('transactions'); await q.insert({}) }`),
      ).toEqual([true])
    })

    it('sees arrow-function handlers and nested callbacks', () => {
      expect(gatedFlags(`export const POST = async (req) => { await admin.from('transactions').insert({}) }`)).toEqual([false])
      expect(
        gatedFlags(`export const POST = async (req) => { await assertSalesOpen(t, c); await retry(async () => admin.from('transactions').insert({})) }`),
      ).toEqual([true])
    })

    it('requires a fresh pre-check for a second write in the same function', () => {
      expect(
        gatedFlags(`async function a(s){ await assertSalesOpen(t,c); await s.from('transactions').insert({}); await s.from('transactions').insert({}) }`),
      ).toEqual([true, false])
    })

    it('sees sale RPCs, including SQL functions that insert into transactions', () => {
      expect(gatedFlags(`async function a(s){ await s.rpc('grant_free_entitlement', {}) }`)).toEqual([false])
      expect(gatedFlags(`async function a(s){ await s.rpc('insert_sale_fn', {}) }`)).toEqual([false])
      expect(gatedFlags(`async function a(s){ await s.rpc('get_plan_features', {}) }`)).toEqual([])
    })

    it('client and MCP call sites must map LM003 instead', () => {
      const c = `'use client'\nexport function useX(){ const go = async () => { const { error } = await s.rpc('grant_free_entitlement', {}); if (error) throw error } }`
      expect(gatedFlags(c, 'components/x.tsx')).toEqual([false])
      expect(gatedFlags(c.replace('throw error', 'throw isSalesBlockedError(error) ? a : b'), 'components/x.tsx')).toEqual([true])
      expect(gatedFlags(`async (i) => { const { error } = await s.rpc('grant_free_entitlement'); if (error?.code === 'LM003') return 1 }`, 'mcp-server/src/tools/x.ts')).toEqual([true])
    })

    it('reads the latest SQL definition and honours DROP FUNCTION', () => {
      const bodies = latestFunctionBodies([
        { name: '1.sql', sql: `CREATE FUNCTION public.f() RETURNS void AS $$ BEGIN INSERT INTO public.transactions VALUES (1); END $$ LANGUAGE plpgsql;` },
        { name: '2.sql', sql: `CREATE OR REPLACE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $function$ BEGIN NULL; END $function$;` },
        { name: '3.sql', sql: `CREATE FUNCTION g() RETURNS void AS $x$ INSERT INTO transactions VALUES (1) $x$ LANGUAGE sql; DROP FUNCTION IF EXISTS public.h(int);` },
      ])
      expect(INSERTS_TRANSACTIONS.test(bodies.get('f') ?? '')).toBe(false)
      expect(INSERTS_TRANSACTIONS.test(bodies.get('g') ?? '')).toBe(true)
    })
  })

  it('finds the known sale-write sites (detector is alive)', () => {
    const where = new Set(sites.map((s) => s.file))
    for (const f of [
      'app/[locale]/(public)/checkout/actions.ts',
      'app/actions/payment-requests.ts',
      'app/api/payments/checkout/route.ts',
      'app/api/stripe/create-payment-intent/route.ts',
      'lib/hooks/use-enrollment.ts',
      'components/public/plan-enroll-button.tsx',
      'mcp-server/src/tools/enroll.ts',
    ]) {
      expect(where, f).toContain(f)
    }
    // 5 transactions inserts + grant_free_subscription + grant_free_entitlement
    // + 3 self_enroll_subscription_course call sites.
    expect(sites.length).toBeGreaterThanOrEqual(10)
  })

  it('the manual checkout page shows the neutral notice to a blocked school (no form)', () => {
    const page = readFileSync(join(root, 'app/[locale]/checkout/manual/page.tsx'), 'utf8')
    const gate = page.indexOf('isSalesOpen(')
    expect(gate).toBeGreaterThan(-1)
    expect(page).toContain('data-testid="checkout-sales-blocked"')
    expect(page).toContain("tFees('salesBlocked')")
    // Before the request form is rendered, and never mentions fees/debt.
    expect(gate).toBeLessThan(page.indexOf('<PaymentRequestForm'))
    expect(page.slice(gate, page.indexOf('<PaymentRequestForm'))).not.toMatch(/overdue|debt|owe/i)
  })

  it('every SQL function that inserts into transactions is classified', () => {
    // A new one must either be pre-gated at its call sites (it is, via
    // SALE_RPCS) or be listed in NOT_A_NEW_SALE with a reason.
    expect(SQL_TRANSACTION_WRITERS).toContain('grant_free_subscription')
    for (const fn of SQL_TRANSACTION_WRITERS) {
      expect(SALE_RPCS.has(fn) || fn in NOT_A_NEW_SALE, fn).toBe(true)
    }
  })

  for (const site of sites) {
    it(`${site.file}:${site.line} (${site.kind}) is gated`, () => {
      expect(
        site.gated,
        site.client
          ? `${site.file}:${site.line} calls a sale RPC without mapping LM003 (isSalesBlockedError)`
          : `${site.file}:${site.line} writes a new sale without assertSalesOpen()`,
      ).toBe(true)
    })
  }

  const gateSql = readFileSync(join(root, 'supabase/migrations/20261009110000_platform_fee_gate_929.sql'), 'utf8')
  const hardeningSql = readFileSync(join(root, 'supabase/migrations/20261009120000_platform_fee_hardening_929.sql'), 'utf8')

  it('SQL and TS renewal constants agree', () => {
    const sqlConst = (fn: string) => {
      const m = gateSql.match(new RegExp(`FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?\\$function\\$ SELECT (\\d+) \\$function\\$`))
      return m ? Number(m[1]) : NaN
    }
    expect(sqlConst('fee_gate_self_managed_renewal_window_days')).toBe(SELF_MANAGED_RENEWAL_WINDOW_DAYS)
    expect(sqlConst('fee_gate_in_flight_max_age_days')).toBe(IN_FLIGHT_MAX_AGE_DAYS)
  })

  it('the trigger and the self-enroll RPC raise the SQLSTATE isSalesBlockedError maps', () => {
    expect(gateSql).toContain(`ERRCODE = '${SALES_BLOCKED_SQLSTATE}'`)
    expect(gateSql).toContain(`'sales_blocked:fees'`)
    expect(hardeningSql).toMatch(/FUNCTION public\.self_enroll_subscription_course[\s\S]*ERRCODE = 'LM003'/)
  })

  it('the pre-block exemption never trusts payment_requests.created_at (hardening)', () => {
    const body = sqlBodies.get('is_preblock_request_settlement') ?? ''
    expect(body).toMatch(/fee_block_open_requests/)
    expect(body).not.toMatch(/created_at/)
  })

  it('the gate is INSERT-only and never touches course access (D5)', () => {
    expect(gateSql).toMatch(/BEFORE INSERT ON public\.transactions/)
    for (const sql of [gateSql, hardeningSql]) {
      expect(sql).not.toMatch(/BEFORE UPDATE ON public\.transactions/)
      expect(sql).not.toMatch(/FUNCTION public\.has_course_access/)
      expect(sql).not.toMatch(/UPDATE public\.entitlements/i)
    }
  })
})
