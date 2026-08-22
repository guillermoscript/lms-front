import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluatePlatformCheckoutAvailability,
  type PlatformProviderRuntimeStatus,
} from '@/lib/billing/platform-checkout-availability'
import { summarizePlanPurchasability, type PlatformPlanInput, type PlatformPlanPriceInput } from '@/lib/billing/plan-prices'
import { getPlatformProviderRuntimeStatuses } from '@/lib/billing/platform-checkout-runtime'

const runtime: PlatformProviderRuntimeStatus = { enabled: true, configured: true, ready: true }
const price = (overrides: Partial<NonNullable<Parameters<typeof evaluatePlatformCheckoutAvailability>[0]['price']>> = {}) => ({
  interval: 'monthly',
  currency: 'usd',
  providerPriceId: 'price_123',
  amount: 29,
  ...overrides,
})

const plan: PlatformPlanInput = {
  planId: 'plan-pro',
  slug: 'pro',
  name: 'Pro',
  priceMonthly: 29,
  priceYearly: 290,
  isActive: true,
}

const planPrice = (overrides: Partial<PlatformPlanPriceInput> = {}): PlatformPlanPriceInput => ({
  priceId: 'row-1',
  planId: 'plan-pro',
  paymentProvider: 'stripe',
  interval: 'monthly',
  providerPriceId: 'price_123',
  currency: 'usd',
  amount: 29,
  isActive: true,
  ...overrides,
})

describe('evaluatePlatformCheckoutAvailability', () => {
  it('rejects a provider whose platform capability is disabled', () => {
    expect(
      evaluatePlatformCheckoutAvailability({ provider: 'paypal', interval: 'monthly', price: price(), runtime }),
    ).toMatchObject({ available: false, reason: 'capability' })
  })

  it.each([
    ['disabled', { enabled: false }],
    ['missing credentials', { configured: false }],
    ['provider not ready', { ready: false }],
  ] as const)('reports %s before inspecting price', (_label, override) => {
    const expectedReason = 'enabled' in override
      ? 'disabled'
      : 'configured' in override
        ? 'missing_credentials'
        : 'provider_not_ready'
    expect(
      evaluatePlatformCheckoutAvailability({
        provider: 'stripe',
        interval: 'monthly',
        price: null,
        runtime: { ...runtime, ...override },
      }),
    ).toMatchObject({ available: false, reason: expectedReason })
  })

  it('separates missing price, interval mismatch, and currency mismatch', () => {
    expect(evaluatePlatformCheckoutAvailability({ provider: 'stripe', interval: 'monthly', price: null, runtime }).reason).toBe('missing_price')
    expect(evaluatePlatformCheckoutAvailability({ provider: 'stripe', interval: 'yearly', price: price(), runtime }).reason).toBe('interval_mismatch')
    expect(evaluatePlatformCheckoutAvailability({ provider: 'stripe', interval: 'monthly', price: price({ currency: 'eur' }), runtime }).reason).toBe('currency_mismatch')
  })

  it('requires a catalog id for catalog-backed providers', () => {
    expect(
      evaluatePlatformCheckoutAvailability({
        provider: 'stripe',
        interval: 'monthly',
        price: price({ providerPriceId: null }),
        runtime,
      }).reason,
    ).toBe('missing_price')
  })

  it('requires the platform webhook secret for Stripe readiness', () => {
    expect(
      evaluatePlatformCheckoutAvailability({
        provider: 'stripe',
        interval: 'monthly',
        price: price(),
        runtime: { enabled: true, configured: false, ready: false },
      }),
    ).toMatchObject({ available: false, reason: 'missing_credentials' })
  })
})

describe('plan purchasability uses executable methods', () => {
  it('does not count a PayPal-only price as purchasable', () => {
    const [summary] = summarizePlanPurchasability([plan], [planPrice({ paymentProvider: 'paypal' })], {
      providerStatuses: { paypal: runtime },
    })

    expect(summary.isPurchasable).toBe(false)
    expect(summary.manualAvailable).toBe(true)
    expect(summary.providerDiagnostics[0].unavailable[0].reason).toBe('capability')
  })

  it('keeps manual transfer separate from automated purchasability', () => {
    const [summary] = summarizePlanPurchasability([plan], [planPrice({ paymentProvider: 'manual', providerPriceId: null })], {
      providerStatuses: { manual: runtime },
    })

    expect(summary.isPurchasable).toBe(false)
    expect(summary.manualAvailable).toBe(true)
  })

  it('accepts one executable automated provider and rejects a disabled one', () => {
    const [summary] = summarizePlanPurchasability(
      [plan],
      [
        planPrice({ paymentProvider: 'stripe' }),
        planPrice({ priceId: 'row-2', paymentProvider: 'lemonsqueezy', providerPriceId: 'variant-1' }),
      ],
      {
        providerStatuses: {
          stripe: runtime,
          lemonsqueezy: { ...runtime, enabled: false },
        },
      },
    )

    expect(summary.isPurchasable).toBe(true)
    expect(summary.automatedProviders.map((provider) => provider.provider)).toEqual(['stripe'])
    expect(summary.providerDiagnostics.find((item) => item.provider === 'lemonsqueezy')?.unavailable[0].reason).toBe('disabled')
  })
})

describe('platform provider runtime status', () => {
  afterEach(() => vi.unstubAllEnvs())

  const settingsClient = (result: { data: unknown[] | null; error: { message: string } | null }) =>
    ({
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve(result),
          }),
        }),
      }),
    }) as unknown as SupabaseClient

  it('does not mark Stripe ready without its platform webhook secret', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_platform')
    vi.stubEnv('STRIPE_PLATFORM_WEBHOOK_SECRET', '')

    expect(getPlatformProviderRuntimeStatuses().stripe).toMatchObject({
      configured: false,
      ready: false,
    })
  })

  it('applies tenant toggles and preserves safe defaults for missing rows', async () => {
    const { getTenantPlatformProviderStatuses } = await import('@/lib/billing/platform-checkout-runtime')
    const statuses = await getTenantPlatformProviderStatuses(
      settingsClient({
        data: [
          { setting_key: 'stripe_enabled', setting_value: { enabled: false } },
          { setting_key: 'paypal_enabled', setting_value: { enabled: true } },
        ],
        error: null,
      }),
      'tenant-1',
    )

    expect(statuses.stripe.enabled).toBe(false)
    expect(statuses.paypal.enabled).toBe(true)
    expect(statuses.lemonsqueezy.enabled).toBe(false)
  })

  it('fails closed when tenant settings cannot be read', async () => {
    const { getTenantPlatformProviderStatuses } = await import('@/lib/billing/platform-checkout-runtime')

    await expect(
      getTenantPlatformProviderStatuses(
        settingsClient({ data: null, error: { message: 'database unavailable' } }),
        'tenant-1',
      ),
    ).rejects.toThrow('database unavailable')
  })
})
