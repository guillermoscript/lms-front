import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import {
  resolveCheckoutProvider,
  describeResolutionError,
  isPlatformCheckoutProvider,
  platformWebhookNamespace,
  PLATFORM_SELF_MANAGED_PROVIDERS,
  PLATFORM_WEBHOOK_PROVIDERS,
  type PlatformPriceRow,
} from '@/lib/billing/platform-billing'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'

/**
 * `POST /api/billing/checkout` — the provider-agnostic replacement for
 * `/api/stripe/checkout-session` (#603) — plus the pure resolution logic behind
 * it.
 *
 * The bug class this guards against is #602's: a plan that cannot be bought,
 * failing with one catch-all message that told nobody which of the several
 * possible misconfigurations it was.
 */

const price = (over: Partial<PlatformPriceRow> = {}): PlatformPriceRow => ({
  paymentProvider: 'stripe',
  interval: 'monthly',
  providerPriceId: 'price_pro_m',
  currency: 'usd',
  amount: 29,
  ...over,
})

describe('resolveCheckoutProvider', () => {
  it('uses the only priced provider when there is exactly one', () => {
    const res = resolveCheckoutProvider([price()], 'monthly')
    expect(res.ok && res.value.provider).toBe('stripe')
    expect(res.ok && res.value.price.providerPriceId).toBe('price_pro_m')
  })

  it('honours an explicit request over everything else', () => {
    const res = resolveCheckoutProvider(
      [price(), price({ paymentProvider: 'lemonsqueezy', providerPriceId: 'variant_1' })],
      'monthly',
      { requested: 'lemonsqueezy', tenantProvider: 'stripe' },
    )
    expect(res.ok && res.value.provider).toBe('lemonsqueezy')
  })

  it('prefers the rail the tenant is already on over an arbitrary pick', () => {
    const res = resolveCheckoutProvider(
      [price(), price({ paymentProvider: 'lemonsqueezy', providerPriceId: 'variant_1' })],
      'monthly',
      { tenantProvider: 'lemonsqueezy' },
    )
    expect(res.ok && res.value.provider).toBe('lemonsqueezy')
  })

  it('refuses to guess between several providers', () => {
    const res = resolveCheckoutProvider(
      [price(), price({ paymentProvider: 'lemonsqueezy', providerPriceId: 'variant_1' })],
      'monthly',
    )
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error.kind).toBe('ambiguous')
  })

  it('separates "no price at all" from "no price on the provider you asked for"', () => {
    // #602 shipped for months because a single catch-all string could not tell
    // these two apart, and neither could anyone reading the logs.
    const none = resolveCheckoutProvider([], 'monthly')
    expect(!none.ok && none.error.kind).toBe('no_prices')

    const wrongProvider = resolveCheckoutProvider([price()], 'monthly', { requested: 'lemonsqueezy' })
    expect(!wrongProvider.ok && wrongProvider.error.kind).toBe('provider_unpriced')
    expect(!wrongProvider.ok && describeResolutionError(wrongProvider.error, 'monthly')).toContain(
      'stripe',
    )
  })

  it('treats a plan priced only monthly as unbuyable yearly', () => {
    const res = resolveCheckoutProvider([price()], 'yearly')
    expect(!res.ok && res.error.kind).toBe('no_prices')
  })

  it('rejects a provider that cannot run a platform checkout', () => {
    // `solana_subs` auto-pulls on chain but can only be cancelled by the payer's
    // own wallet, so it stays out of platform billing even though `solana` does
    // not (#610).
    const res = resolveCheckoutProvider(
      [price({ paymentProvider: 'solana_subs', providerPriceId: 'x' })],
      'monthly',
      { requested: 'solana_subs' },
    )
    expect(!res.ok && res.error.kind).toBe('unsupported')
  })

  it('ignores a stored tenant provider that has no price for this interval', () => {
    const res = resolveCheckoutProvider([price()], 'monthly', { tenantProvider: 'lemonsqueezy' })
    expect(res.ok && res.value.provider).toBe('stripe')
  })
})

describe('platform billing capability', () => {
  it('is separate from supportsHostedCheckout, which describes the STUDENT shape', () => {
    // Stripe's student checkout is a Connect PaymentIntent confirmed with
    // Elements, so supportsHostedCheckout is false — yet Stripe Checkout
    // Sessions on the platform account are exactly a hosted platform checkout.
    // Gating the new route on the old flag would have rejected the one provider
    // platform billing works with today.
    expect(PROVIDER_CAPABILITIES.stripe.supportsHostedCheckout).toBe(false)
    expect(PROVIDER_CAPABILITIES.stripe.supportsPlatformBillingCheckout).toBe(true)
  })

  it('excludes every rail a school cannot actually buy a plan on', () => {
    // `manual` settles through platform_payment_requests rather than a checkout;
    // `solana_subs` cannot be cancelled without the payer's wallet;
    // `binance_personal` pays a SCHOOL's account, and the payee here is us.
    for (const slug of ['manual', 'solana_subs', 'binance_personal'] as const) {
      expect(isPlatformCheckoutProvider(slug)).toBe(false)
    }
  })

  it('includes the crypto rails opened in #610', () => {
    for (const slug of ['binance', 'solana'] as const) {
      expect(isPlatformCheckoutProvider(slug)).toBe(true)
    }
  })

  it('keeps every self-managed rail out of the webhook allowlist unless it signs', () => {
    // A provider with no signed webhook must never get an endpoint: that
    // endpoint would be an unauthenticated way to activate a subscription.
    expect(PLATFORM_WEBHOOK_PROVIDERS).toContain('binance')
    expect(PLATFORM_WEBHOOK_PROVIDERS).not.toContain('solana')
    expect(PLATFORM_WEBHOOK_PROVIDERS).not.toContain('manual')
  })

  it('derives the cron\'s self-managed set from the capability, not a slug list', () => {
    // The four cron phases hardcoded 'manual', so the first non-manual
    // self-managed subscription would never have expired or reminded.
    expect(PLATFORM_SELF_MANAGED_PROVIDERS).toEqual(
      expect.arrayContaining(['manual', 'binance', 'solana']),
    )
    // Rails that renew themselves must NOT be cron-expired.
    expect(PLATFORM_SELF_MANAGED_PROVIDERS).not.toContain('stripe')
    expect(PLATFORM_SELF_MANAGED_PROVIDERS).not.toContain('lemonsqueezy')
    expect(PLATFORM_SELF_MANAGED_PROVIDERS).not.toContain('solana_subs')
  })

  it('namespaces the platform webhook ledger away from the student one', () => {
    expect(platformWebhookNamespace('stripe')).toBe('platform:stripe')
    expect(platformWebhookNamespace('stripe')).not.toBe('stripe')
  })
})

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

interface Write {
  table: string
  op: 'insert' | 'update' | 'upsert'
  values: Record<string, unknown>
}

const state: {
  user: { id: string; email: string } | null
  role: string | null
  prices: PlatformPriceRow[]
  plan: { plan_id: string; slug: string; name: string; price_monthly: number; price_yearly: number } | null
  existingSub: Record<string, unknown> | null
  billingCustomer: string | null
  writes: Write[]
  checkoutCalls: Record<string, unknown>[]
  cancelCalls: { id: string; immediate: boolean }[]
  cancelThrows: boolean
  checkoutThrows: boolean
  overLimit: boolean
  openRequest: boolean
  recordedRequests: Record<string, unknown>[]
  providerStatuses: Record<string, { enabled: boolean; configured: boolean; ready: boolean }>
} = {
  user: null,
  role: null,
  prices: [],
  plan: null,
  existingSub: null,
  billingCustomer: null,
  writes: [],
  checkoutCalls: [],
  cancelCalls: [],
  cancelThrows: false,
  checkoutThrows: false,
  overLimit: false,
  openRequest: false,
  recordedRequests: [],
  providerStatuses: {},
}

const TENANT = '00000000-0000-0000-0000-000000000001'
const PLAN_ID = 'f9318c3a-815d-448d-802e-cf356c2791a4'

function makeBuilder(table: string, writes: Write[]) {
  let pending: Write | null = null
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    insert(values: Record<string, unknown>) {
      pending = { table, op: 'insert', values }
      writes.push(pending)
      return b
    },
    update(values: Record<string, unknown>) {
      pending = { table, op: 'update', values }
      writes.push(pending)
      return b
    },
    upsert(values: Record<string, unknown>) {
      pending = { table, op: 'upsert', values }
      writes.push(pending)
      return b
    },
    maybeSingle: () => Promise.resolve(settle()),
    single: () => Promise.resolve(settle()),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
  }
  function settle() {
    if (pending) {
      if (pending.table === 'platform_subscription_switches' && pending.op === 'insert') {
        return { data: { switch_id: 'switch-1' }, error: null }
      }
      return { data: null, error: null }
    }
    if (table === 'tenant_users') return { data: state.role ? { role: state.role } : null, error: null }
    if (table === 'platform_plans') {
      return state.plan ? { data: state.plan, error: null } : { data: null, error: { message: 'not found' } }
    }
    if (table === 'platform_subscriptions') return { data: state.existingSub, error: null }
    if (table === 'tenants') return { data: { billing_email: 'billing@school.test', name: 'School' }, error: null }
    if (table === 'tenant_billing_customers') {
      return { data: state.billingCustomer ? { provider_customer_id: state.billingCustomer } : null, error: null }
    }
    return { data: null, error: null }
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: state.user }, error: null }) },
      from: (table: string) => makeBuilder(table, state.writes),
    }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => Promise.resolve({ from: (table: string) => makeBuilder(table, state.writes) }),
}))

vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => Promise.resolve(TENANT) }))

vi.mock('@/lib/i18n/request-locale', () => ({ resolveRequestLocale: () => 'es' }))

// Route tests mock provider sessions and database rows; keep the runtime
// configuration truth table in platform-checkout-availability.test.ts.
vi.mock('@/lib/billing/platform-checkout-runtime', () => ({
  getTenantPlatformProviderStatuses: () => Promise.resolve(state.providerStatuses),
}))

vi.mock('@/lib/billing/platform-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-billing')>()
  return {
    ...actual,
    getActivePlanPrices: () => Promise.resolve(state.prices),
    getPlatformBillingProvider: (provider: string) => ({
      provider,
      ensureCustomer: () => Promise.resolve({ providerCustomerId: 'cus_new' }),
      cancelSubscription: (id: string, immediate: boolean) => {
        if (state.cancelThrows) return Promise.reject(new Error('provider down'))
        state.cancelCalls.push({ id, immediate })
        return Promise.resolve({ mode: 'immediate' as const })
      },
      createCheckoutSession: (params: Record<string, unknown>) => {
        if (state.checkoutThrows) return Promise.reject(new Error('checkout down'))
        state.checkoutCalls.push(params)
        // Solana hands back a QR and an on-chain reference, not a redirect.
        return Promise.resolve(
          provider === 'solana'
            ? { kind: 'qr', url: 'solana:https://school.lvh.me/api/billing/solana/tx', reference: 'r', providerRef: 'RefPubkey111' }
            : { kind: 'redirect', url: 'https://pay.example/session', reference: 'r' },
        )
      },
    }),
  }
})

vi.mock('@/lib/billing/plan-limits', () => ({
  checkPlanLimits: () =>
    Promise.resolve(
      state.overLimit
        ? { ok: false, violations: [{ kind: 'courses', limit: 5, usage: 9 }], planName: 'Starter' }
        : { ok: true, violations: [], planName: 'Pro' },
    ),
  formatPlanLimitError: (r: { ok: boolean }) => (r.ok ? null : 'You are over the limits of that plan'),
}))

vi.mock('@/lib/billing/payment-request-ttl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/payment-request-ttl')>()
  return { ...actual, hasOpenPaymentRequest: () => Promise.resolve(state.openRequest) }
})

vi.mock('@/lib/billing/solana-platform-payment', () => ({
  getPlatformSolanaConfig: () => ({ rpcUrl: 'https://rpc.test', platformWallet: {} }),
  quotePlatformSettlement: () =>
    Promise.resolve({ currency: 'usdc', base: 29_000_000, mint: 'Mint111', solUsd: null }),
  recordSolanaPlatformRequest: (params: Record<string, unknown>) => {
    state.recordedRequests.push(params)
    return Promise.resolve({ requestId: 'req-1' })
  },
}))

import { POST } from '@/app/api/billing/checkout/route'

function makeReq(body: Record<string, unknown>): NextRequest {
  return {
    json: () => Promise.resolve(body),
    headers: new Headers({ origin: 'https://school.lvh.me:3000' }),
  } as unknown as NextRequest
}

beforeEach(() => {
  state.user = { id: 'user-1', email: 'admin@school.test' }
  state.role = 'admin'
  state.prices = [price()]
  state.plan = { plan_id: PLAN_ID, slug: 'pro', name: 'Pro', price_monthly: 29, price_yearly: 290 }
  state.existingSub = null
  state.billingCustomer = 'cus_existing'
  state.writes = []
  state.checkoutCalls = []
  state.cancelCalls = []
  state.cancelThrows = false
  state.checkoutThrows = false
  state.overLimit = false
  state.openRequest = false
  state.recordedRequests = []
  state.providerStatuses = {
    stripe: { enabled: true, configured: true, ready: true },
    binance: { enabled: true, configured: true, ready: true },
    solana: { enabled: true, configured: true, ready: true },
  }
})

describe('POST /api/billing/checkout — guards', () => {
  it('401s an anonymous caller', async () => {
    state.user = null
    expect((await POST(makeReq({ planId: PLAN_ID }))).status).toBe(401)
  })

  it('403s a non-admin member', async () => {
    state.role = 'teacher'
    expect((await POST(makeReq({ planId: PLAN_ID }))).status).toBe(403)
  })

  it('400s a missing plan id and an invalid interval', async () => {
    expect((await POST(makeReq({}))).status).toBe(400)
    expect((await POST(makeReq({ planId: PLAN_ID, interval: 'weekly' }))).status).toBe(400)
  })

  it('404s an unknown or inactive plan', async () => {
    state.plan = null
    expect((await POST(makeReq({ planId: PLAN_ID }))).status).toBe(404)
  })

  it('rejects the free plan', async () => {
    state.plan = { plan_id: PLAN_ID, slug: 'free', name: 'Free', price_monthly: 0, price_yearly: 0 }
    const res = await POST(makeReq({ planId: PLAN_ID }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('free plan')
  })

  it('names the configured providers when the requested one has no price', async () => {
    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'lemonsqueezy' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('stripe')
  })

  it('rejects a disabled provider before creating a customer or checkout session', async () => {
    state.providerStatuses.stripe.enabled = false

    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'stripe' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('disabled')
    expect(state.checkoutCalls).toHaveLength(0)
    expect(state.writes.some((write) => write.table === 'tenant_billing_customers')).toBe(false)
  })
})

describe('POST /api/billing/checkout — happy path', () => {
  it('starts a hosted checkout and preserves the requester locale in both URLs', async () => {
    const res = await POST(makeReq({ planId: PLAN_ID, interval: 'monthly', locale: 'es' }))
    expect(res.status).toBe(200)
    expect((await res.json())).toMatchObject({ url: 'https://pay.example/session', provider: 'stripe' })

    const call = state.checkoutCalls[0]
    expect(call).toMatchObject({
      mode: 'subscription',
      hosted: true,
      providerPriceId: 'price_pro_m',
      providerCustomerId: 'cus_existing',
      successUrl: 'https://school.lvh.me:3000/es/dashboard/admin/billing?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://school.lvh.me:3000/es/dashboard/admin/billing/upgrade',
    })
    // The webhook resolves the tenant and plan from exactly this bag.
    expect(call.metadata).toMatchObject({
      tenant_id: TENANT,
      plan_id: PLAN_ID,
      plan_slug: 'pro',
      interval: 'monthly',
    })
  })

  it('creates and stores a billing customer when the tenant has none', async () => {
    state.billingCustomer = null
    await POST(makeReq({ planId: PLAN_ID }))
    expect(state.checkoutCalls[0].providerCustomerId).toBe('cus_new')
    expect(
      state.writes.find((w) => w.table === 'tenant_billing_customers')?.values,
    ).toMatchObject({ tenant_id: TENANT, payment_provider: 'stripe', provider_customer_id: 'cus_new' })
  })
})

describe('POST /api/billing/checkout — switching payment method', () => {
  it('keeps source active while a replacement checkout is pending', async () => {
    state.existingSub = {
      subscription_id: 'ps-1',
      provider_subscription_id: 'sub_old',
      status: 'active',
      payment_provider: 'lemonsqueezy',
    }
    state.prices = [price()] // only stripe is priced

    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'stripe' }))
    expect(res.status).toBe(200)
    expect(state.cancelCalls).toHaveLength(0)
    expect(state.writes.some((w) => w.table === 'platform_subscriptions')).toBe(false)
    expect(state.writes.find((w) => w.table === 'platform_subscription_switches' && w.op === 'insert')?.values).toMatchObject({
      source_payment_provider: 'lemonsqueezy',
      source_provider_subscription_id: 'sub_old',
      target_payment_provider: 'stripe',
    })
    expect(state.checkoutCalls[0].metadata).toMatchObject({ billing_switch_id: 'switch-1' })
    expect(state.checkoutCalls).toHaveLength(1)
  })

  it('a failed replacement checkout leaves source untouched and closes the switch intent', async () => {
    state.existingSub = {
      subscription_id: 'ps-1',
      provider_subscription_id: 'sub_old',
      status: 'active',
      payment_provider: 'lemonsqueezy',
    }
    state.checkoutThrows = true

    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'stripe' }))
    expect(res.status).toBe(500)
    expect(state.cancelCalls).toHaveLength(0)
    expect(state.writes.some((w) => w.table === 'platform_subscriptions')).toBe(false)
    expect(state.writes.find((w) => w.table === 'platform_subscription_switches' && w.op === 'update')?.values).toMatchObject({
      state: 'failed',
    })
  })

  it('sends a same-provider plan change back to the in-app flow', async () => {
    state.existingSub = {
      subscription_id: 'ps-1',
      provider_subscription_id: 'sub_live',
      status: 'active',
      payment_provider: 'stripe',
    }
    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'stripe' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('billing page')
    expect(state.checkoutCalls).toHaveLength(0)
  })

  it('lets a school on manual transfer start a card subscription', async () => {
    // `manual` is not a live provider subscription — there is nothing to cancel,
    // and the old route already allowed this direction.
    state.existingSub = {
      subscription_id: 'ps-1',
      provider_subscription_id: null,
      status: 'active',
      payment_provider: 'manual',
    }
    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'stripe' }))
    expect(res.status).toBe(200)
    expect(state.cancelCalls).toHaveLength(0)
  })
})


describe('POST /api/billing/checkout — crypto rails (#610)', () => {
  const solanaPrice = () => [price({ paymentProvider: 'solana', providerPriceId: null, amount: 29 })]
  const binancePrice = () => [price({ paymentProvider: 'binance', providerPriceId: null, amount: 29 })]

  it('starts a Solana checkout and records the intent the wallet will settle', async () => {
    state.prices = solanaPrice()
    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'solana' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    // The client must be told this is a QR: a `solana:` URL is not somewhere a
    // desktop browser can be navigated to.
    expect(body.kind).toBe('qr')
    expect(body.requestId).toBe('req-1')
    expect(state.recordedRequests).toHaveLength(1)
    // Recorded against the reference the provider minted, which is the only
    // thing tying the anonymous /tx call back to this school and amount.
    expect(state.recordedRequests[0].reference).toBe('RefPubkey111')
    expect(state.recordedRequests[0].amountUsd).toBe(29)
  })

  it('charges the plan list price when a catalog-less row carries no amount', async () => {
    state.prices = [
      price({ paymentProvider: 'binance', providerPriceId: null, amount: null, interval: 'yearly' }),
    ]
    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'binance', interval: 'yearly' }))
    expect(res.status).toBe(200)
    expect(state.checkoutCalls[0].amount).toBe(290)
  })

  it('refuses a crypto checkout the school is already over the limits of', async () => {
    // The pre-flight has to happen BEFORE the QR: a confirmed transfer cannot
    // be refunded from this app, so an activation-time refusal would take the
    // money and withhold the plan.
    state.overLimit = true
    state.prices = solanaPrice()
    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'solana' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('over the limits')
    expect(state.checkoutCalls).toHaveLength(0)
    expect(state.recordedRequests).toHaveLength(0)
  })

  it('does not check limits on a rail that can bill the school again next month', async () => {
    state.overLimit = true
    state.prices = [price()]
    expect((await POST(makeReq({ planId: PLAN_ID, provider: 'stripe' }))).status).toBe(200)
  })

  it('refuses a second Solana request while one is still open', async () => {
    state.openRequest = true
    state.prices = solanaPrice()
    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'solana' }))
    expect(res.status).toBe(400)
    expect(state.recordedRequests).toHaveLength(0)
  })

  it('lets a school renew on the SAME self-managed rail', async () => {
    // The same-provider guard exists to stop a second PROVIDER-side
    // subscription. Binance has none: paying again IS the renewal, and blocking
    // it would leave the school no way to buy its next period.
    state.prices = binancePrice()
    state.existingSub = {
      subscription_id: 'ps-1',
      provider_subscription_id: 'order_123',
      status: 'active',
      payment_provider: 'binance',
    }
    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'binance' }))
    expect(res.status).toBe(200)
    expect(state.checkoutCalls).toHaveLength(1)
  })

  it('never cancels the period a same-rail renewal is extending', async () => {
    state.prices = binancePrice()
    state.existingSub = {
      subscription_id: 'ps-1',
      provider_subscription_id: 'order_123',
      status: 'active',
      payment_provider: 'binance',
    }
    await POST(makeReq({ planId: PLAN_ID, provider: 'binance' }))
    const cancels = state.writes.filter(
      (w) => w.table === 'platform_subscriptions' && w.values.status === 'canceled',
    )
    expect(cancels).toHaveLength(0)
  })

  it('still supersedes when the school moves from a card to crypto', async () => {
    state.prices = binancePrice()
    state.existingSub = {
      subscription_id: 'ps-1',
      provider_subscription_id: 'sub_live',
      status: 'active',
      payment_provider: 'stripe',
    }
    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'binance' }))
    expect(res.status).toBe(200)
    expect(state.cancelCalls).toHaveLength(0)
    expect(state.checkoutCalls[0].metadata).toMatchObject({ billing_switch_id: 'switch-1' })
  })

  it('links a Stripe → Solana payment request to the pending switch', async () => {
    state.prices = solanaPrice()
    state.existingSub = {
      subscription_id: 'ps-1',
      plan_id: 'plan-old',
      current_period_end: '2026-09-01T00:00:00.000Z',
      provider_subscription_id: 'sub-live',
      status: 'active',
      payment_provider: 'stripe',
    }

    const res = await POST(makeReq({ planId: PLAN_ID, provider: 'solana' }))
    expect(res.status).toBe(200)
    expect(state.recordedRequests[0]).toMatchObject({ switchId: 'switch-1' })
    expect(state.cancelCalls).toHaveLength(0)
  })
})
