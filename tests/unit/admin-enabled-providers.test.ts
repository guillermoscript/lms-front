import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Pins getEnabledPaymentProviders() — the single source of truth that gates
 * which providers appear in the plan/product forms (issue #280 admin UI).
 * Contract:
 *   - `manual` is ALWAYS available (offline never gated).
 *   - No settings row yet → seed defaults: Stripe on, everything else off.
 *   - The one Solana toggle expands to BOTH `solana` and `solana_subs`.
 *   - A non-admin (or any failure) degrades to `['manual']`, never throws.
 *   - Stripe: the flag alone is not enough — the tenant's Connect account
 *     must actually have `charges_enabled`, or the rail is dropped even
 *     though `stripe_enabled` is on. This is what stopped an admin who
 *     abandoned Connect onboarding from putting a dead card form in front
 *     of students.
 *   - Solana: the flag alone is not enough — a `tenant_payment_wallets` row
 *     for `solana` with a `wallet_address` must exist, or both `solana` and
 *     `solana_subs` are dropped.
 *   - binance_personal needs Pay ID + BOTH credentials (the secret signs the
 *     confirmation query, so a key-only row could never confirm a payment).
 */

const state: {
  role: string
  settingsRows: { setting_key: string; setting_value: unknown }[]
  tenant: { stripe_account_id: string | null; stripe_charges_enabled: boolean | null } | null
  wallets: { provider: string; wallet_address: string | null; credentials: unknown }[]
} = { role: 'admin', settingsRows: [], tenant: null, wallets: [] }

function makeFakeAdmin() {
  return {
    from(table: string) {
      if (table === 'tenant_settings') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => Promise.resolve({ data: state.settingsRows, error: null }),
        }
        return builder
      }
      if (table === 'tenants') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          single: () =>
            Promise.resolve(
              state.tenant
                ? { data: state.tenant, error: null }
                : { data: null, error: { message: 'not found' } }
            ),
        }
        return builder
      }
      if (table === 'tenant_payment_wallets') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: (_col: string, providers: string[]) =>
            Promise.resolve({
              data: state.wallets.filter((w) => providers.includes(w.provider)),
              error: null,
            }),
        }
        return builder
      }
      throw new Error(`makeFakeAdmin: unexpected table "${table}"`)
    },
  }
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

const READY_TENANT = { stripe_account_id: 'acct_ok', stripe_charges_enabled: true }
const UNFINISHED_TENANT = { stripe_account_id: 'acct_unfinished', stripe_charges_enabled: false }
const SOLANA_WALLET = { provider: 'solana', wallet_address: 'ADDR123', credentials: null }

beforeEach(() => {
  state.role = 'admin'
  state.settingsRows = []
  // Default: Stripe is on by seed default, so give it a connected account
  // unless a test is specifically exercising the not-ready path.
  state.tenant = READY_TENANT
  state.wallets = []
})

describe('getEnabledPaymentProviders', () => {
  it('no settings rows → seed defaults: manual + stripe only (stripe connected)', async () => {
    const r = await getEnabledPaymentProviders()
    expect(r.success).toBe(true)
    expect(r.data.sort()).toEqual(['manual', 'stripe'])
  })

  it('manual is always present even when stripe is explicitly off', async () => {
    state.settingsRows = [off('stripe_enabled')]
    const r = await getEnabledPaymentProviders()
    expect(r.data).toContain('manual')
    expect(r.data).not.toContain('stripe')
  })

  it('stripe on + connected account → included', async () => {
    state.settingsRows = [on('stripe_enabled')]
    state.tenant = READY_TENANT
    const r = await getEnabledPaymentProviders()
    expect(r.data).toContain('stripe')
  })

  it('stripe on + onboarding never finished → excluded, never reaches checkout', async () => {
    state.settingsRows = [on('stripe_enabled')]
    state.tenant = UNFINISHED_TENANT
    const r = await getEnabledPaymentProviders()
    expect(r.data).not.toContain('stripe')
    expect(r.data).toContain('manual')
  })

  it('stripe on + no connected account at all → excluded', async () => {
    state.settingsRows = [on('stripe_enabled')]
    state.tenant = { stripe_account_id: null, stripe_charges_enabled: false }
    const r = await getEnabledPaymentProviders()
    expect(r.data).not.toContain('stripe')
  })

  it('solana on + wallet configured → both solana and solana_subs included', async () => {
    state.settingsRows = [off('stripe_enabled'), on('solana_enabled')]
    state.wallets = [SOLANA_WALLET]
    const r = await getEnabledPaymentProviders()
    expect(r.data).toContain('solana')
    expect(r.data).toContain('solana_subs')
  })

  it('solana on + no wallet configured → both solana providers excluded', async () => {
    state.settingsRows = [off('stripe_enabled'), on('solana_enabled')]
    state.wallets = []
    const r = await getEnabledPaymentProviders()
    expect(r.data).not.toContain('solana')
    expect(r.data).not.toContain('solana_subs')
    expect(r.data).toContain('manual')
  })

  it('binance_personal needs Pay ID + BOTH credentials, not just the flag', async () => {
    state.settingsRows = [off('stripe_enabled'), on('binance_personal_enabled')]
    state.wallets = [
      {
        provider: 'binance_personal',
        wallet_address: 'payid-1',
        credentials: { api_key: 'k', api_secret: 's' },
      },
    ]
    const withCreds = await getEnabledPaymentProviders()
    expect(withCreds.data).toContain('binance_personal')

    state.wallets = [{ provider: 'binance_personal', wallet_address: 'payid-1', credentials: {} }]
    const withoutCreds = await getEnabledPaymentProviders()
    expect(withoutCreds.data).not.toContain('binance_personal')
  })

  // Confirming a transfer signs the SAPI query with the secret, so a half-saved
  // credential pair could take a payment it could never confirm. The settings
  // screen's readiness pill (getBinancePersonalStatus) always demanded both.
  it('binance_personal with an api_key but no api_secret is not offered', async () => {
    state.settingsRows = [off('stripe_enabled'), on('binance_personal_enabled')]
    state.wallets = [
      {
        provider: 'binance_personal',
        wallet_address: 'payid-1',
        credentials: { api_key: 'k' },
      },
    ]
    const r = await getEnabledPaymentProviders()
    expect(r.data).not.toContain('binance_personal')
    expect(r.data).toContain('manual')
  })

  it('all toggles on → every ready provider listed', async () => {
    state.settingsRows = [on('stripe_enabled'), on('paypal_enabled'), on('lemonsqueezy_enabled'), on('solana_enabled')]
    state.tenant = READY_TENANT
    state.wallets = [SOLANA_WALLET]
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
