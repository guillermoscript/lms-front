import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import {
  fetchActiveBankAccounts,
  fetchOpenFeeRequest,
  selectBankAccountsFor,
  selectBankAccountsForAll,
  toBankAccountView,
} from '@/lib/billing/platform-bank-accounts'
import { parseBankAccountInput } from '@/lib/billing/platform-bank-account-input'
import { feeTransferReference, withRequestSuffix } from '@/lib/billing/platform-fee-reference'

/** Minimal PostgREST builder double: records calls, resolves to `result`. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = []
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) {
    chain[m] = (...a: unknown[]) => {
      calls.push([m, ...a])
      return chain
    }
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  const from = (table: string) => {
    calls.push(['from', table])
    return chain
  }
  return { client: { from } as never, calls }
}

const usd = { id: 'u', currency: 'USD', bankName: 'USD Bank' }
const eur = { id: 'e', currency: 'EUR', bankName: 'EUR Bank' }

describe('selectBankAccountsFor', () => {
  it('prefers accounts in the balance currency', () => {
    expect(selectBankAccountsFor([usd, eur], 'EUR')).toEqual([eur])
    expect(selectBankAccountsFor([usd, eur], ' eur ')).toEqual([eur])
  })

  it('falls back to the USD account', () => {
    expect(selectBankAccountsFor([eur, usd], 'VES')).toEqual([usd])
  })

  it('is empty when nothing fits', () => {
    expect(selectBankAccountsFor([eur], 'VES')).toEqual([])
    expect(selectBankAccountsFor([], 'USD')).toEqual([])
  })
})

describe('selectBankAccountsForAll', () => {
  it('unions per currency without duplicates, never other currencies', () => {
    const gbp = { id: 'g', currency: 'GBP', bankName: 'GBP Bank' }
    expect(selectBankAccountsForAll([usd, eur, gbp], ['EUR', 'VES', 'USD'])).toEqual([eur, usd])
  })
})

describe('toBankAccountView', () => {
  const base = {
    id: 'x', currency: 'USD', label: 'Main', bankName: 'B', accountHolder: 'H', accountNumber: '1',
    accountType: null, routingNumber: null, swiftCode: null, extraInstructions: null,
    isActive: true, sortOrder: 0, updatedAt: '2026-10-01T00:00:00Z',
  }
  it('joins routing and SWIFT, null when neither', () => {
    expect(toBankAccountView(base).routingOrSwift).toBeNull()
    expect(toBankAccountView({ ...base, swiftCode: 'BOFAUS3N' }).routingOrSwift).toBe('BOFAUS3N')
    expect(toBankAccountView({ ...base, routingNumber: '026009593', swiftCode: 'BOFAUS3N' }).routingOrSwift).toBe('026009593 / BOFAUS3N')
  })
  it('drops bookkeeping fields', () => {
    expect(Object.keys(toBankAccountView(base)).sort()).toEqual(
      ['accountHolder', 'accountNumber', 'accountType', 'bankName', 'currency', 'extraInstructions', 'id', 'label', 'routingOrSwift'],
    )
  })
})

describe('fetchActiveBankAccounts', () => {
  it('reads active rows only and maps them to the view', async () => {
    const { client, calls } = fakeClient({
      data: [{
        id: 'a1', currency: 'USD', label: 'Main', bank_name: 'B', account_holder: 'H', account_number: '123',
        account_type: '', routing_number: null, swift_code: 'BOFAUS3N', extra_instructions: null,
        is_active: true, sort_order: 0, updated_at: '2026-10-01T00:00:00Z',
      }],
      error: null,
    })
    const rows = await fetchActiveBankAccounts(client)
    expect(calls).toContainEqual(['from', 'platform_bank_accounts'])
    expect(calls).toContainEqual(['eq', 'is_active', true])
    expect(rows).toEqual([{
      id: 'a1', currency: 'USD', label: 'Main', bankName: 'B', accountHolder: 'H', accountNumber: '123',
      accountType: null, routingOrSwift: 'BOFAUS3N', extraInstructions: null,
    }])
  })

  it('throws with the error code only (no row data, no message)', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42P01', message: 'acct 123' } })
    await expect(fetchActiveBankAccounts(client)).rejects.toThrow(/^platform_bank_accounts read failed: 42P01$/)
  })
})

describe('fetchOpenFeeRequest', () => {
  const now = new Date('2026-10-08T12:00:00Z')
  const row = (over: Record<string, unknown>) => ({
    request_id: 'r1', amount: '15.50', currency: 'usd', status: 'pending',
    created_at: '2026-10-07T00:00:00Z', expires_at: '2026-10-20T00:00:00Z', ...over,
  })

  it('returns the newest open fee request, scoped to the tenant and fee type', async () => {
    const { client, calls } = fakeClient({ data: [row({})], error: null })
    expect(await fetchOpenFeeRequest(client, 't1', now)).toEqual({
      id: 'r1', amount: 15.5, currency: 'USD', requestedAt: '2026-10-07T00:00:00Z',
    })
    expect(calls).toContainEqual(['eq', 'tenant_id', 't1'])
    expect(calls).toContainEqual(['eq', 'request_type', 'fee'])
  })

  it('skips an expired request like the checkout route does', async () => {
    const { client } = fakeClient({ data: [row({ expires_at: '2026-10-01T00:00:00Z' })], error: null })
    expect(await fetchOpenFeeRequest(client, 't1', now)).toBeNull()
  })

  it('is null when there is none, throws on a read error', async () => {
    expect(await fetchOpenFeeRequest(fakeClient({ data: [], error: null }).client, 't1', now)).toBeNull()
    await expect(fetchOpenFeeRequest(fakeClient({ data: null, error: { code: 'X' } }).client, 't1', now)).rejects.toThrow(/X/)
  })
})

describe('parseBankAccountInput', () => {
  const valid = {
    currency: ' usd ',
    label: 'Main',
    bankName: 'First Bank',
    accountHolder: 'LMS Inc',
    accountNumber: ' 0001 ',
    accountType: '',
    routingNumber: '  ',
    swiftCode: 'bofa us 3n',
    extraInstructions: '',
    sortOrder: '2',
    isActive: true,
  }

  it('normalises like the database does', () => {
    const r = parseBankAccountInput(valid)
    expect(r).toEqual({
      ok: true,
      value: {
        currency: 'USD',
        label: 'Main',
        bankName: 'First Bank',
        accountHolder: 'LMS Inc',
        accountNumber: '0001',
        accountType: null,
        routingNumber: null,
        swiftCode: 'BOFAUS3N',
        extraInstructions: null,
        sortOrder: 2,
        isActive: true,
      },
    })
  })

  it('reports the offending fields, not their values', () => {
    const r = parseBankAccountInput({ ...valid, currency: 'US', accountNumber: ' ', swiftCode: 'NOPE' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fields.sort()).toEqual(['accountNumber', 'currency', 'swiftCode'])
  })

  it('uppercases and trims the currency, rejects non-letter codes', () => {
    const ok = parseBankAccountInput({ ...valid, currency: ' usd ' })
    expect(ok.ok && ok.value.currency).toBe('USD')
    for (const bad of ['usd1', 'us', 'usdd', '12$', '']) {
      expect(parseBankAccountInput({ ...valid, currency: bad })).toEqual({ ok: false, fields: ['currency'] })
    }
  })

  it('rejects over-long values', () => {
    const r = parseBankAccountInput({ ...valid, label: 'x'.repeat(81) })
    expect(r).toEqual({ ok: false, fields: ['label'] })
  })
})

describe('transfer references', () => {
  it('is tenant based, and gains the request suffix once known', () => {
    expect(feeTransferReference('qa-fee-blocked')).toBe('FEES-QA-FEE-BLOCKED')
    expect(feeTransferReference('acme', '3f2a9c10-aaaa-bbbb-cccc-111122223333')).toBe('FEES-ACME-3F2A9C10')
  })

  it('falls back to the bare request id without a tenant reference', () => {
    expect(withRequestSuffix(null, '3f2a9c10-aaaa')).toBe('3f2a9c10-aaaa')
    expect(withRequestSuffix('FEES-ACME', '3f2a9c10-aaaa')).toBe('FEES-ACME-3F2A9C10')
  })
})

describe('no env-var bank details (#929)', () => {
  it('PLATFORM_FEE_BANK_INSTRUCTIONS is gone from code and .env.example', () => {
    const root = join(__dirname, '..', '..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name) && !p.endsWith('platform-bank-accounts.test.ts') && readFileSync(p, 'utf8').includes('PLATFORM_FEE_BANK_INSTRUCTIONS')) hits.push(p)
      }
    }
    for (const d of ['app', 'components', 'lib']) walk(join(root, d))
    expect(hits).toEqual([])
    expect(readFileSync(join(root, '.env.example'), 'utf8')).not.toContain('PLATFORM_FEE_BANK_INSTRUCTIONS')
  })
})
