import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import es from '../../messages/es.json'

/**
 * Source contracts for the platform fee UI (#929, steps 6-7). The unit suite
 * runs in node (no DOM), so these pin the invariants that matter most by
 * reading the source: who sees the banner, who may write the ledger, that the
 * client never sends a price it computed, and that every message key the
 * components use exists in both catalogues.
 */
const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const FILES = {
  layout: 'app/[locale]/dashboard/layout.tsx',
  banner: 'components/admin/platform-fees/fee-standing-banner.tsx',
  card: 'components/admin/platform-fees/fee-balance-card.tsx',
  dialog: 'components/admin/platform-fees/fee-pay-now-dialog.tsx',
  statementDoc: 'components/admin/platform-fees/fee-statement-document.tsx',
  statementPage: 'app/[locale]/dashboard/admin/earnings/statements/[statementNumber]/page.tsx',
  platformStatementPage: 'app/[locale]/platform/tenants/[tenantId]/statements/[statementNumber]/page.tsx',
  actions: 'app/actions/platform/platform-fees.ts',
  ledgerActions: 'components/platform/fees/fee-ledger-actions.tsx',
  panel: 'components/platform/fees/tenant-fee-panel.tsx',
  view: 'lib/billing/platform-fee-view.ts',
  earnings: 'app/[locale]/dashboard/admin/earnings/page.tsx',
} as const

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

describe('platform fee UI contracts', () => {
  it('mounts the fee banner in the dashboard shell for admins only', () => {
    const src = read(FILES.layout)
    expect(src).toMatch(/role === 'admin' && <FeeStandingBanner \/>/)
    expect(src.match(/<FeeStandingBanner/g)).toHaveLength(1)
  })

  it('the banner fails open and only loads the ledger when standing is not ok', () => {
    const src = read('lib/billing/platform-fee-account.ts')
    const fn = src.slice(src.indexOf('export async function loadFeeBannerNotice'))
    expect(fn).toMatch(/catch \(err\)[\s\S]*return null/)
    expect(fn.indexOf("standing.state === 'ok'")).toBeGreaterThan(-1)
    expect(fn.indexOf("standing.state === 'ok'")).toBeLessThan(fn.indexOf('loadTenantFeeLedger'))
  })

  it('the client-side helpers import nothing server-only', () => {
    const imports = (src: string) => src.split('\n').filter((l) => /^import\b/.test(l)).join('\n')
    const view = imports(read(FILES.view))
    expect(view).not.toMatch(/supabase|platform-fee-enforcement|platform-fee-account|server-only|next\/headers/)
    const dialogSrc = read(FILES.dialog)
    expect(dialogSrc.startsWith("'use client'")).toBe(true)
    expect(imports(dialogSrc)).not.toMatch(/@\/lib\/supabase|platform-fee-account|platform-fee-paynow|platform-fee-enforcement/)
  })

  it('Pay now posts a cap to the fee checkout route, never a computed price field', () => {
    const dialog = read(FILES.dialog)
    expect(dialog).toContain("fetch('/api/billing/fees/checkout'")
    expect(dialog).not.toMatch(/\bprice\s*:/)
  })

  it('every super-admin fee action verifies the super admin before touching the admin client', () => {
    const src = read(FILES.actions)
    expect(src.startsWith("'use server'")).toBe(true)
    const bodies = src.split(/export async function /).slice(1)
    expect(bodies.length).toBe(4)
    for (const body of bodies) {
      const verify = body.indexOf('await verifySuperAdmin()')
      expect(verify, body.slice(0, 40)).toBeGreaterThan(-1)
      expect(body.indexOf('createAdminClient()')).toBeGreaterThan(verify)
    }
    expect(src).toMatch(/isSuperAdmin\(\)/)
  })

  it('the school statement page authorizes the viewer and the owning tenant before loading', () => {
    const src = read(FILES.statementPage)
    const load = src.indexOf('loadFeeStatement(admin')
    expect(src.indexOf("membership.role !== 'admin'")).toBeGreaterThan(-1)
    expect(src.indexOf("membership.role !== 'admin'")).toBeLessThan(load)
    expect(src.indexOf('owner.tenant_id !== tenantId')).toBeLessThan(load)
    expect(read(FILES.platformStatementPage)).toContain('statement.tenantId !== tenantId')
  })

  it('the statement is labelled non-fiscal', () => {
    expect(read(FILES.statementDoc)).toContain("t('nonFiscal')")
    expect(get(en, 'platformFees.statement.nonFiscal')).toMatch(/not a tax invoice/i)
  })

  it('the earnings page streams the balance card behind a skeleton', () => {
    const src = read(FILES.earnings)
    expect(src).toMatch(/<Suspense fallback=\{<FeeBalanceSkeleton \/>\}>\s*<FeeBalanceCard/)
  })

  describe('message keys', () => {
    // [file, translator variable, namespace]
    const scopes: [string, string, string][] = [
      [FILES.banner, 't', 'platformFees.banner'],
      [FILES.card, 't', 'platformFees.card'],
      [FILES.dialog, 't', 'platformFees.payNow'],
      [FILES.statementDoc, 't', 'platformFees.statement'],
      [FILES.ledgerActions, 't', 'platform.fees'],
      [FILES.panel, 't', 'platform.fees'],
    ]

    for (const [file, fn, ns] of scopes) {
      it(`${file} (${fn} → ${ns}) uses only keys that exist in en and es`, () => {
        const src = read(file)
        const keys = [...src.matchAll(new RegExp(`\\b${fn}\\('([A-Za-z0-9_.]+)'`, 'g'))].map((m) => m[1])
        expect(keys.length).toBeGreaterThan(0)
        for (const key of keys) {
          expect(typeof get(en, `${ns}.${key}`), `en ${ns}.${key}`).toBe('string')
          expect(typeof get(es, `${ns}.${key}`), `es ${ns}.${key}`).toBe('string')
        }
      })
    }

    it('dynamic keys cover every value they can take', () => {
      for (const cat of [en, es]) {
        for (const s of ['ok', 'reminded', 'overdue', 'blocked']) {
          expect(typeof get(cat, `platformFees.card.state.${s}`)).toBe('string')
          expect(typeof get(cat, `platform.fees.state.${s}`)).toBe('string')
        }
        for (const s of ['paid', 'due', 'overdue']) expect(typeof get(cat, `platformFees.card.statements.status.${s}`)).toBe('string')
        for (const r of ['stripe', 'paypal', 'binance', 'solana', 'manual']) {
          expect(typeof get(cat, `platformFees.payNow.rails.${r}`)).toBe('string')
          expect(typeof get(cat, `platformFees.payNow.railHints.${r}`)).toBe('string')
        }
        for (const k of ['offline', 'waiver']) expect(typeof get(cat, `platform.fees.record.kinds.${k}`)).toBe('string')
        for (const a of ['request_confirmed', 'offline_recorded', 'waived', 'payment_reversed', 'exemption_set', 'exemption_cleared']) {
          expect(typeof get(cat, `platform.fees.auditActions.${a}`)).toBe('string')
        }
      }
    })

    it('every error code the components map has a message', () => {
      const pick = (src: string) => {
        const block = src.slice(src.indexOf('const KNOWN_ERRORS'), src.indexOf('] as const'))
        return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
      }
      const payNow = pick(read(FILES.dialog))
      const admin = pick(read(FILES.ledgerActions))
      expect(payNow.length).toBeGreaterThan(5)
      for (const cat of [en, es]) {
        for (const c of [...payNow, 'generic']) expect(typeof get(cat, `platformFees.payNow.errors.${c}`), c).toBe('string')
        for (const c of [...admin, 'generic']) expect(typeof get(cat, `platform.fees.errors.${c}`), c).toBe('string')
      }
      // Every code the checkout route can return is mapped.
      const route = read('app/api/billing/fees/checkout/route.ts')
      const routeCodes = new Set([...route.matchAll(/errorBody\('([a-z_]+)'/g)].map((m) => m[1]))
      const quoteCodes = [...route.slice(route.indexOf('QUOTE_ERRORS'), route.indexOf('const errorBody')).matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1])
      for (const c of [...routeCodes, ...quoteCodes]) {
        if (c === 'invalid_body' || c === 'internal') continue // generic fallback
        expect(payNow, `route code ${c}`).toContain(c)
      }
    })
  })
})
