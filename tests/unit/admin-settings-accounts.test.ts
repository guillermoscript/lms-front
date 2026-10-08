import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * manual_payment_accounts is student-readable, so the admin actions re-normalise
 * it server-side (an MCP write or stale client can send anything), and the
 * Binance key removal is admin-only and tenant-scoped.
 */

const state: {
  role: string
  upserts: Array<Record<string, unknown>[]>
  deletes: Array<Array<[string, unknown]>>
} = { role: 'admin', upserts: [], deletes: [] }

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve('t1'),
  getCurrentUserId: () => Promise.resolve('u1'),
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: () => Promise.resolve(state.role) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => {
        state.upserts.push(rows)
        const value = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown>
        // updateSetting chains .select().single(); updateSettings awaits directly.
        return Object.assign(Promise.resolve({ error: null }), {
          select: () => ({
            single: () => Promise.resolve({ data: { setting_value: value.setting_value }, error: null }),
          }),
        })
      },
      delete: () => {
        const filters: Array<[string, unknown]> = []
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val])
            if (filters.length === 2) {
              state.deletes.push(filters)
              return Promise.resolve({ error: null })
            }
            return chain
          },
        }
        return chain
      },
    }),
  }),
}))

import {
  removeBinancePersonalCredentials,
  updateSetting,
  updateSettings,
} from '@/app/actions/admin/settings'

beforeEach(() => {
  state.role = 'admin'
  state.upserts = []
  state.deletes = []
})

function storedAccounts() {
  const row = state.upserts.flat().find((r) => r.setting_key === 'manual_payment_accounts')
  return (row?.setting_value as { accounts: Record<string, unknown>[] } | undefined)?.accounts
}

describe('manual_payment_accounts server-side normalisation', () => {
  it('updateSettings normalises an MCP-style bare array and strips secrets', async () => {
    const r = await updateSettings({
      manual_payment_accounts: [
        { kind: 'zelle', email: 'a@b.co', api_key: 'AKIA', credentials: { api_secret: 's' } },
        null,
        { bank: 'no method' },
      ] as never,
    })
    expect(r.success).toBe(true)
    const accounts = storedAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts?.[0]).toMatchObject({ id: 'preset-zelle', kind: 'zelle', method: 'Zelle' })
    expect(JSON.stringify(state.upserts)).not.toMatch(/api_key|credentials|AKIA/)
  })

  it('updateSetting normalises junk to an empty list', async () => {
    const r = await updateSetting('manual_payment_accounts', [
      'garbage',
      { method: '', api_key: 'AKIA' },
    ] as never)
    expect(r.success).toBe(true)
    expect(storedAccounts()).toEqual([])
  })

  it('refuses non-admins and writes nothing', async () => {
    state.role = 'student'
    const r1 = await updateSettings({ manual_payment_accounts: { accounts: [{ method: 'x' }] } as never })
    const r2 = await updateSetting('manual_payment_accounts', { accounts: [] } as never)
    expect(r1).toMatchObject({ success: false, error: 'Unauthorized' })
    expect(r2).toMatchObject({ success: false, error: 'Unauthorized' })
    expect(state.upserts).toHaveLength(0)
  })
})

describe('removeBinancePersonalCredentials', () => {
  it('deletes only this tenant\'s binance_personal wallet', async () => {
    const r = await removeBinancePersonalCredentials()
    expect(r).toEqual({ success: true })
    expect(state.deletes).toEqual([
      [
        ['tenant_id', 't1'],
        ['provider', 'binance_personal'],
      ],
    ])
  })

  it('is admin-only', async () => {
    state.role = 'teacher'
    const r = await removeBinancePersonalCredentials()
    expect(r).toEqual({ success: false, error: 'Unauthorized' })
    expect(state.deletes).toHaveLength(0)
  })
})
