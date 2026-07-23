import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Regression for issue #479: getAllSettingsByCategory()'s categoryMap
 * previously had no entry for `binance_enabled`, so it fell through to the
 * `'general'` bucket instead of `'payment'`. The admin Settings > Payment
 * page reads `settings.payment.binance_enabled` — a missing map entry made
 * the Binance Pay toggle always render unchecked on reload regardless of the
 * saved value, even though getEnabledPaymentProviders() (which queries the
 * key directly) still gated checkout/product forms correctly.
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
    order() { return Promise.resolve({ data: state.rows, error: null }) },
  }
  return b
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => Promise.resolve('t1') }))
vi.mock('@/lib/supabase/get-user-role', () => ({ getUserRole: () => Promise.resolve(state.role) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeFakeAdmin(),
}))

import { getAllSettingsByCategory } from '@/app/actions/admin/settings'

beforeEach(() => { state.role = 'admin'; state.rows = [] })

describe('getAllSettingsByCategory', () => {
  it('groups binance_enabled under payment, not general', async () => {
    state.rows = [{ setting_key: 'binance_enabled', setting_value: { enabled: true } }]
    const r = await getAllSettingsByCategory()
    expect(r.success).toBe(true)
    expect(r.data?.payment?.binance_enabled?.value?.enabled).toBe(true)
    expect(r.data?.general?.binance_enabled).toBeUndefined()
  })

  it('keeps every other payment toggle categorized alongside it', async () => {
    state.rows = [
      { setting_key: 'stripe_enabled', setting_value: { enabled: true } },
      { setting_key: 'paypal_enabled', setting_value: { enabled: false } },
      { setting_key: 'lemonsqueezy_enabled', setting_value: { enabled: false } },
      { setting_key: 'solana_enabled', setting_value: { enabled: false } },
      { setting_key: 'binance_enabled', setting_value: { enabled: true } },
    ]
    const r = await getAllSettingsByCategory()
    const paymentKeys = Object.keys(r.data?.payment ?? {})
    expect(paymentKeys.sort()).toEqual(
      ['binance_enabled', 'lemonsqueezy_enabled', 'paypal_enabled', 'solana_enabled', 'stripe_enabled'].sort()
    )
  })
})
