import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Connected-account readiness gate — issue #606.
 *
 * `tenants.stripe_account_id` is persisted by `stripe.accounts.create` BEFORE
 * the admin is handed the hosted onboarding link, so its presence proves an
 * account object exists, not that the school can charge. Student checkout gated
 * on presence, so an abandoned onboarding sailed through to a PaymentIntent
 * whose `transfer_data.destination` Stripe then rejected — the student saw a
 * generic payment failure on the school's storefront and nothing in the product
 * told either party why.
 *
 * These tests pin the fix:
 *  - readiness is `charges_enabled`, NOT account presence and NOT
 *    `details_submitted` (an Express account can submit details and still be
 *    blocked on review or fresh requirements);
 *  - the two refusals stay DISTINCT, because "never connected" and "still
 *    finishing setup" need different words on the storefront;
 *  - the branch is the `requiresConnectedAccount` CAPABILITY — a rail with no
 *    per-tenant account to onboard is ready without a database read at all;
 *  - a tenant row that cannot be read fails CLOSED;
 *  - and no `payment_provider === 'stripe'` string comparison creeps back into
 *    the gated call sites, which is the whole point of naming the ability.
 */

const single = vi.fn()
const createAdminClient = vi.fn(() => ({
  from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

const {
  evaluateConnectedAccountReadiness,
  isReadyToAcceptPayments,
  assertReadyToPublish,
  PAYMENTS_NOT_CONNECTED_CODE,
  PAYMENTS_ONBOARDING_INCOMPLETE_CODE,
  READINESS_CODE,
  READINESS_MESSAGE,
  READINESS_ADMIN_MESSAGE,
} = await import('@/lib/payments/tenant-payment-readiness')

const { PROVIDER_CAPABILITIES } = await import('@/lib/payments/types')

const TENANT = '00000000-0000-0000-0000-000000000001'

beforeEach(() => {
  single.mockReset()
  createAdminClient.mockClear()
})

describe('evaluateConnectedAccountReadiness', () => {
  it('refuses a tenant with no connected account as not_connected', () => {
    expect(
      evaluateConnectedAccountReadiness({
        stripe_account_id: null,
        stripe_charges_enabled: false,
      }),
    ).toEqual({ ready: false, reason: 'not_connected' })
  })

  it('refuses an abandoned onboarding as onboarding_incomplete, not not_connected', () => {
    // The #606 case exactly: the account id is set, so the OLD presence check
    // passed. The two reasons must not collapse — the storefront says
    // "still finishing setup", not "contact the admin".
    expect(
      evaluateConnectedAccountReadiness({
        stripe_account_id: 'acct_live_but_unfinished',
        stripe_charges_enabled: false,
      }),
    ).toEqual({ ready: false, reason: 'onboarding_incomplete' })
  })

  it('accepts a tenant whose account can charge', () => {
    expect(
      evaluateConnectedAccountReadiness({
        stripe_account_id: 'acct_ok',
        stripe_charges_enabled: true,
      }),
    ).toEqual({ ready: true })
  })

  it('treats a missing row as not_connected rather than falling open', () => {
    expect(evaluateConnectedAccountReadiness(null)).toEqual({
      ready: false,
      reason: 'not_connected',
    })
  })
})

describe('isReadyToAcceptPayments', () => {
  it('short-circuits every rail without a connected account, with no database read', async () => {
    const railsWithoutOnboarding = (
      Object.keys(PROVIDER_CAPABILITIES) as (keyof typeof PROVIDER_CAPABILITIES)[]
    ).filter((slug) => !PROVIDER_CAPABILITIES[slug].requiresConnectedAccount)

    // Sanity: the filter is not silently empty.
    expect(railsWithoutOnboarding.length).toBeGreaterThan(0)

    for (const slug of railsWithoutOnboarding) {
      await expect(isReadyToAcceptPayments(TENANT, slug)).resolves.toEqual({ ready: true })
    }
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('reads the tenant row for a rail that requires a connected account', async () => {
    single.mockResolvedValue({
      data: { stripe_account_id: 'acct_ok', stripe_charges_enabled: true },
      error: null,
    })
    await expect(isReadyToAcceptPayments(TENANT, 'stripe')).resolves.toEqual({ ready: true })
    expect(createAdminClient).toHaveBeenCalledTimes(1)
  })

  it('refuses an account whose charges are still disabled', async () => {
    single.mockResolvedValue({
      data: { stripe_account_id: 'acct_unfinished', stripe_charges_enabled: false },
      error: null,
    })
    await expect(isReadyToAcceptPayments(TENANT, 'stripe')).resolves.toEqual({
      ready: false,
      reason: 'onboarding_incomplete',
    })
  })

  it('fails closed when the tenant row cannot be read', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'nope' } })
    await expect(isReadyToAcceptPayments(TENANT, 'stripe')).resolves.toEqual({
      ready: false,
      reason: 'not_connected',
    })
  })
})

describe('assertReadyToPublish', () => {
  it('blocks a paid Stripe offering with actionable copy while onboarding is incomplete', async () => {
    single.mockResolvedValue({
      data: { stripe_account_id: 'acct_unfinished', stripe_charges_enabled: false },
      error: null,
    })
    await expect(assertReadyToPublish(TENANT, 'stripe')).rejects.toThrow(
      READINESS_ADMIN_MESSAGE.onboarding_incomplete,
    )
    // Actionable means it names the place to go, not just the problem.
    expect(READINESS_ADMIN_MESSAGE.onboarding_incomplete).toMatch(/Settings/)
    expect(READINESS_ADMIN_MESSAGE.not_connected).toMatch(/Settings/)
  })

  it('lets a ready school publish', async () => {
    single.mockResolvedValue({
      data: { stripe_account_id: 'acct_ok', stripe_charges_enabled: true },
      error: null,
    })
    await expect(assertReadyToPublish(TENANT, 'stripe')).resolves.toBeUndefined()
  })

  it('never blocks a rail with nothing to onboard', async () => {
    await expect(assertReadyToPublish(TENANT, 'manual')).resolves.toBeUndefined()
    await expect(assertReadyToPublish(TENANT, 'solana')).resolves.toBeUndefined()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe('the response contract', () => {
  it('keeps the two refusals on separate codes and separate messages', () => {
    expect(READINESS_CODE.not_connected).toBe(PAYMENTS_NOT_CONNECTED_CODE)
    expect(READINESS_CODE.onboarding_incomplete).toBe(PAYMENTS_ONBOARDING_INCOMPLETE_CODE)
    expect(PAYMENTS_NOT_CONNECTED_CODE).not.toBe(PAYMENTS_ONBOARDING_INCOMPLETE_CODE)
    expect(READINESS_MESSAGE.not_connected).not.toBe(READINESS_MESSAGE.onboarding_incomplete)
  })
})

describe('the capability table', () => {
  it('marks exactly the rails whose school must onboard a per-tenant account', () => {
    const requiring = Object.entries(PROVIDER_CAPABILITIES)
      .filter(([, caps]) => caps.requiresConnectedAccount)
      .map(([slug]) => slug)
      .sort()

    // Stripe Connect Express is the only rail today with an onboarding session a
    // school can walk away from half-finished. Both Solana rails also settle
    // outside the platform account, but their "account" is a wallet address
    // pasted into Settings — live the moment it is saved. Adding a rail here is
    // a deliberate act, so this list is pinned rather than derived.
    expect(requiring).toEqual(['stripe'])
  })

  it('declares the key on every provider class, matching the static table', () => {
    // Provider classes cannot be instantiated in a unit test (their constructors
    // demand API credentials), so the two declarations are compared at the
    // source level — the drift the `PROVIDER_CAPABILITIES` doc-comment warns about.
    const files: Record<string, string> = {
      stripe: 'stripe-provider.ts',
      paypal: 'paypal-provider.ts',
      lemonsqueezy: 'lemonsqueezy-provider.ts',
      solana: 'solana-provider.ts',
      solana_subs: 'solana-subscriptions-provider.ts',
      manual: 'manual-provider.ts',
      binance: 'binance-provider.ts',
      binance_personal: 'binance-personal-provider.ts',
    }
    expect(Object.keys(files).sort()).toEqual(Object.keys(PROVIDER_CAPABILITIES).sort())

    for (const [slug, file] of Object.entries(files)) {
      const source = readFileSync(join(process.cwd(), 'lib/payments', file), 'utf8')
      const expected =
        PROVIDER_CAPABILITIES[slug as keyof typeof PROVIDER_CAPABILITIES]
          .requiresConnectedAccount
      expect(source, `${file} declares requiresConnectedAccount`).toMatch(
        new RegExp(`requiresConnectedAccount:\\s*${expected}\\b`),
      )
    }
  })
})

describe('the gated call sites', () => {
  /**
   * Acceptance criterion: the gate is capability-driven. A resurrected
   * `payment_provider === 'stripe'` (or a bare `providerType === 'stripe'`) in
   * one of these files would be the exact regression the capability exists to
   * prevent — the rule would silently stop applying to the next rail.
   */
  const GATED_FILES = [
    'app/api/stripe/create-payment-intent/route.ts',
    'app/api/payments/checkout/route.ts',
    'lib/payments/tenant-payment-readiness.ts',
    'lib/payments/payment-readiness-codes.ts',
  ]

  /**
   * One pre-existing comparison stays, and is pinned here rather than waved
   * through: `/api/stripe/create-payment-intent` is the Stripe-only route, and
   * this line asks "is the plan I was handed actually on this route's rail"
   * before taking the native-subscription path. It predates #606 and is not
   * what the capability replaces. Pinning it exactly means a NEW comparison
   * still fails the test.
   */
  const KNOWN_LEGACY = new Set([
    "if (planId && planPaymentProvider === 'stripe' && planProviderPriceId) {",
  ])

  it.each(GATED_FILES)('%s branches on capability, not on the provider name', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    const comparisons = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('*') && !line.startsWith('//'))
      .filter((line) => /(===|!==)\s*['"]stripe['"]|['"]stripe['"]\s*(===|!==)/.test(line))
      .filter((line) => !KNOWN_LEGACY.has(line))
    expect(comparisons).toEqual([])
  })
})
