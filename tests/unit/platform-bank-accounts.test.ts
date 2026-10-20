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
import { extractVesPerUsd, usdToVes } from '@/lib/billing/ves-rate-convert'
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

describe('Pago Móvil (VES) with a USD balance', () => {
  const pm = { id: 'p', currency: 'VES', kind: 'pago_movil', bankName: 'Banesco' }
  const zinli = { id: 'z', currency: 'USD', kind: 'zinli', bankName: null }

  it('is always offered next to the USD accounts, order kept', () => {
    expect(selectBankAccountsFor([zinli, pm], 'USD')).toEqual([zinli, pm])
    expect(selectBankAccountsFor([pm, zinli], 'USD')).toEqual([pm, zinli])
  })

  it('is offered even when no USD account exists', () => {
    expect(selectBankAccountsFor([pm], 'USD')).toEqual([pm])
    expect(selectBankAccountsFor([pm], 'EUR')).toEqual([pm])
  })

  it('does not duplicate when the balance itself is in VES', () => {
    expect(selectBankAccountsFor([pm, zinli], 'VES')).toEqual([pm])
  })
})

describe('VES rate', () => {
  it('reads a dot path and accepts numeric strings, comma decimals included', () => {
    expect(extractVesPerUsd({ data: { usd: 36.5 } }, 'data.usd')).toBe(36.5)
    expect(extractVesPerUsd({ rate: '36.5' }, 'rate')).toBe(36.5)
    expect(extractVesPerUsd({ rate: '36,5' }, 'rate')).toBe(36.5)
    expect(extractVesPerUsd([{ price: 40 }], '0.price')).toBe(40)
  })

  it('rejects missing, non-numeric and implausible values', () => {
    for (const body of [{}, { rate: 'abc' }, { rate: 0 }, { rate: -3 }, { rate: 1e12 }, null]) {
      expect(extractVesPerUsd(body, 'rate')).toBeNull()
    }
  })

  it('converts USD to bolívares rounded to cents', () => {
    expect(usdToVes(10, 36.5)).toBe(365)
    expect(usdToVes(15.5, 36.4567)).toBe(565.08)
    expect(usdToVes(0, 36.5)).toBeNull()
    expect(usdToVes(10, 0)).toBeNull()
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
    id: 'x', kind: 'bank' as const, currency: 'USD', label: 'Main', email: null, document: null, bankName: 'B', accountHolder: 'H', accountNumber: '1',
    accountType: null, routingNumber: null, swiftCode: null, extraInstructions: null,
    isActive: true, sortOrder: 0, updatedAt: '2026-10-01T00:00:00Z',
  }
  it('exposes routing and SWIFT separately, null when absent', () => {
    const none = toBankAccountView(base)
    expect([none.routingNumber, none.swiftCode]).toEqual([null, null])
    const swift = toBankAccountView({ ...base, swiftCode: 'BOFAUS3N' })
    expect([swift.routingNumber, swift.swiftCode]).toEqual([null, 'BOFAUS3N'])
    const both = toBankAccountView({ ...base, routingNumber: '026009593', swiftCode: 'BOFAUS3N' })
    expect([both.routingNumber, both.swiftCode]).toEqual(['026009593', 'BOFAUS3N'])
  })
  it('drops bookkeeping fields', () => {
    expect(Object.keys(toBankAccountView(base)).sort()).toEqual(
      ['accountHolder', 'accountNumber', 'accountType', 'bankName', 'currency', 'document', 'email', 'extraInstructions', 'id', 'kind', 'label', 'routingNumber', 'swiftCode'],
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
      id: 'a1', kind: 'bank', currency: 'USD', label: 'Main', bankName: 'B', accountHolder: 'H', accountNumber: '123',
      accountType: null, routingNumber: null, swiftCode: 'BOFAUS3N', email: null, document: null, extraInstructions: null,
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
        kind: 'bank',
        currency: 'USD',
        label: 'Main',
        email: null,
        document: null,
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

  describe('payment methods', () => {
    const base = { currency: 'usd', label: 'Wallet', sortOrder: 0, isActive: true }

    it('a Zinli account needs only an email', () => {
      const r = parseBankAccountInput({ ...base, kind: 'zinli', email: ' pay@example.com ' })
      expect(r.ok && r.value).toMatchObject({ kind: 'zinli', email: 'pay@example.com', bankName: null, accountNumber: null })
    })

    it('requires each method\'s own fields', () => {
      expect(parseBankAccountInput({ ...base, kind: 'zinli' })).toEqual({ ok: false, fields: ['email'] })
      expect(parseBankAccountInput({ ...base, kind: 'binance' })).toEqual({ ok: false, fields: ['accountNumber'] })
      expect(parseBankAccountInput({ ...base, kind: 'cash' })).toEqual({ ok: false, fields: ['extraInstructions'] })
      const pm = parseBankAccountInput({ ...base, kind: 'pago_movil' })
      expect(pm.ok).toBe(false)
      if (!pm.ok) expect(pm.fields.sort()).toEqual(['accountNumber', 'bankName', 'document'])
    })

    it('a complete Pago Móvil account saves with Pay-style columns', () => {
      const r = parseBankAccountInput({
        ...base, currency: 'ves', kind: 'pago_movil', bankName: 'Banesco', accountNumber: '04141234567', document: 'V-12345678',
      })
      expect(r.ok && r.value).toMatchObject({ kind: 'pago_movil', currency: 'VES', document: 'V-12345678' })
    })

    it('rejects a malformed email', () => {
      expect(parseBankAccountInput({ ...base, kind: 'paypal', email: 'nope' })).toEqual({ ok: false, fields: ['email'] })
    })

    it('drops fields the chosen method does not use', () => {
      const r = parseBankAccountInput({ ...base, kind: 'paypal', email: 'a@b.co', accountNumber: '999', bankName: 'Old Bank', swiftCode: 'BOFAUS3N' })
      expect(r.ok && r.value).toMatchObject({ accountNumber: null, bankName: null, swiftCode: null })
    })

    it('defaults to a bank account and rejects unknown methods', () => {
      const bank = parseBankAccountInput({ ...base, bankName: 'B', accountHolder: 'H', accountNumber: '1' })
      expect(bank.ok && bank.value.kind).toBe('bank')
      expect(parseBankAccountInput({ ...base, kind: 'venmo', email: 'a@b.co' }).ok).toBe(false)
    })
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
