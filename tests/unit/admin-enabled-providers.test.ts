import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Pins getEnabledPaymentProviders() — the single source of truth that gates
 * which providers appear in the plan/product forms (issue #280 admin UI).
 * Contract:
 *   - `manual` is ALWAYS available (offline never gated).
 *   - No settings row yet → seed defaults: Stripe on, everything else off.
 *   - The one Solana toggle expands to BOTH `solana` and `solana_subs`.
 *   - A non-admin (or any failure) degrades to `['manual']`, never throws.
 */

const state: {
  role: string
  rows: { setting_key: string; setting_value: unknown }[]
} = { role: 'admin', rows: [] }

function makeFakeAdmin() {
  const b: Record<string, unknown> = {
    from() { return b },
    select() { return b },
    eq() { return b },
    in() { return Promise.resolve({ data: state.rows, error: null }) },
  }
  return b
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => Promise.resolve('t1') }))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: () => Promise.resolve(state.role) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeFakeAdmin(),
}))

import { getEnabledPaymentProviders } from '@/app/actions/admin/settings'

const on = (key: string) => ({ setting_key: key, setting_value: { enabled: true } })
const off = (key: string) => ({ setting_key: key, setting_value: { enabled: false } })

beforeEach(() => { state.role = 'admin'; state.rows = [] })

describe('getEnabledPaymentProviders', () => {
  it('no settings rows → seed defaults: manual + stripe only', async () => {
    const r = await getEnabledPaymentProviders()
    expect(r.success).toBe(true)
    expect(r.data.sort()).toEqual(['manual', 'stripe'])
  })

  it('manual is always present even when stripe is explicitly off', async () => {
    state.rows = [off('stripe_enabled')]
    const r = await getEnabledPaymentProviders()
    expect(r.data).toContain('manual')
    expect(r.data).not.toContain('stripe')
  })

  it('solana toggle expands to both solana and solana_subs', async () => {
    state.rows = [off('stripe_enabled'), on('solana_enabled')]
    const r = await getEnabledPaymentProviders()
    expect(r.data).toContain('solana')
    expect(r.data).toContain('solana_subs')
  })

  it('all toggles on → every provider listed', async () => {
    state.rows = [on('stripe_enabled'), on('paypal_enabled'), on('lemonsqueezy_enabled'), on('solana_enabled')]
    const r = await getEnabledPaymentProviders()
    expect(r.data.sort()).toEqual(
      ['lemonsqueezy', 'manual', 'paypal', 'solana', 'solana_subs', 'stripe']
    )
  })

  it('non-admin → degrades to manual only, never throws', async () => {
    state.role = 'student'
    const r = await getEnabledPaymentProviders()
    expect(r.success).toBe(false)
    expect(r.data).toEqual(['manual'])
  })
})
