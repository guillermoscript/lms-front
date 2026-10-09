import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const rpc = vi.fn()
const isSuperAdmin = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
vi.mock('@/lib/supabase/get-user-role', () => ({ isSuperAdmin: () => isSuperAdmin() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentUserId: async () => '11111111-1111-4111-8111-111111111111' }))

import { savePlatformBankAccountAction, setPlatformBankAccountActiveAction } from '@/app/actions/platform/bank-accounts'

const valid = {
  currency: 'USD', label: 'Main', bankName: 'Bank', accountHolder: 'Holder', accountNumber: '123456789',
}
const ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  rpc.mockReset()
  isSuperAdmin.mockReset()
})

describe('platform bank account actions', () => {
  it('refuses a non-super-admin without touching the database', async () => {
    isSuperAdmin.mockResolvedValue(false)
    expect(await savePlatformBankAccountAction(null, valid)).toEqual({ ok: false, error: 'forbidden' })
    expect(await setPlatformBankAccountActiveAction(ID, false)).toEqual({ ok: false, error: 'forbidden' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never logs the account number on a database error', async () => {
    isSuperAdmin.mockResolvedValue(true)
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'failed for 123456789' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await savePlatformBankAccountAction(null, valid)
    expect(res).toEqual({ ok: false, error: 'internal' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('123456789')
    spy.mockRestore()
  })

  it('audit rows in the migration never carry the account number', () => {
    const file = readdirSync('supabase/migrations').find((f) => f.startsWith('20261009140000'))!
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8')
    const audits = sql.match(/INSERT INTO platform_fee_audit_log[\s\S]*?;/g) ?? []
    expect(audits.length).toBeGreaterThan(0)
    for (const a of audits) expect(a).not.toMatch(/account_number|routing|swift/i)
  })
})
