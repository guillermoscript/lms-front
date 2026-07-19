import { describe, it, expect, vi, afterEach } from 'vitest'
import { StripePaymentProvider } from '@/lib/payments/stripe-provider'
import { LemonSqueezyProvider } from '@/lib/payments/lemonsqueezy-provider'
import { ManualPaymentProvider } from '@/lib/payments/manual-provider'
import { PayPalPaymentProvider } from '@/lib/payments/paypal-provider'
import { PROVIDER_CAPABILITIES, type IPaymentProvider } from '@/lib/payments/types'

/**
 * Pins the native plan-change contract (#463): a provider that advertises
 * `supportsPlanChange` swaps the item/variant on the SAME subscription (so a
 * switch never spawns a second live sub / double-bills), and the capability map
 * stays in sync with each provider class.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStripe(retrieveResult: any, updateResult: any) {
  const stripe = {
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue(retrieveResult),
      update: vi.fn().mockResolvedValue(updateResult),
    },
  }
  const provider = new StripePaymentProvider('sk_test_x')
  // Override the internally-constructed SDK client with our fake.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(provider as any).stripe = stripe
  return { provider, stripe }
}

const stripeSubShape = (id: string, priceId: string) => ({
  id,
  status: 'active',
  cancel_at_period_end: false,
  items: { data: [{ id: 'si_1', price: { id: priceId }, current_period_end: 1893456000 }] },
})

describe('StripePaymentProvider.updateSubscription', () => {
  it('swaps the item on the same subscription with default proration', async () => {
    const { provider, stripe } = makeStripe(
      stripeSubShape('sub_1', 'price_old'),
      stripeSubShape('sub_1', 'price_new'),
    )

    const result = await provider.updateSubscription('sub_1', { newProviderPriceId: 'price_new' })

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_1')
    expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1)
    const [id, params] = stripe.subscriptions.update.mock.calls[0]
    expect(id).toBe('sub_1')
    expect(params.items).toEqual([{ id: 'si_1', price: 'price_new' }])
    expect(params.proration_behavior).toBe('create_prorations')
    // Same subscription id — no second live subscription.
    expect(result.id).toBe('sub_1')
    expect(result.status).toBe('active')
  })

  it('passes through an explicit proration behavior and metadata', async () => {
    const { provider, stripe } = makeStripe(
      stripeSubShape('sub_2', 'price_old'),
      stripeSubShape('sub_2', 'price_new'),
    )

    await provider.updateSubscription('sub_2', {
      newProviderPriceId: 'price_new',
      prorationBehavior: 'none',
      metadata: { reason: 'plan_change' },
    })

    const [, params] = stripe.subscriptions.update.mock.calls[0]
    expect(params.proration_behavior).toBe('none')
    expect(params.metadata).toEqual({ reason: 'plan_change' })
  })

  it('throws when the subscription has no billable item to swap', async () => {
    const { provider } = makeStripe({ id: 'sub_3', items: { data: [] } }, {})
    await expect(
      provider.updateSubscription('sub_3', { newProviderPriceId: 'price_new' }),
    ).rejects.toThrow(/no billable item/)
  })
})

describe('LemonSqueezyProvider.updateSubscription', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubFetch(response: { ok: boolean; status?: number; body?: unknown; text?: string }) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status ?? 200,
      json: async () => response.body,
      text: async () => response.text ?? '',
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('PATCHes the subscription with the new variant id', async () => {
    const fetchMock = stubFetch({
      ok: true,
      body: { data: { id: '99', attributes: { status: 'active', renews_at: '2027-01-01T00:00:00Z', cancelled: false } } },
    })
    const provider = new LemonSqueezyProvider('key', 'store', 'secret')

    const result = await provider.updateSubscription('99', { newProviderPriceId: '424242' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.lemonsqueezy.com/v1/subscriptions/99')
    expect(init.method).toBe('PATCH')
    const payload = JSON.parse(init.body)
    expect(payload.data.attributes.variant_id).toBe(424242)
    expect(result.id).toBe('99')
    expect(result.status).toBe('active')
  })

  it('rejects a non-numeric variant id before calling the API', async () => {
    const fetchMock = stubFetch({ ok: true, body: {} })
    const provider = new LemonSqueezyProvider('key', 'store', 'secret')
    await expect(
      provider.updateSubscription('99', { newProviderPriceId: 'not-a-number' }),
    ).rejects.toThrow(/invalid variant id/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws on a non-ok API response', async () => {
    stubFetch({ ok: false, status: 422, text: 'unprocessable' })
    const provider = new LemonSqueezyProvider('key', 'store', 'secret')
    await expect(
      provider.updateSubscription('99', { newProviderPriceId: '424242' }),
    ).rejects.toThrow(/HTTP 422/)
  })
})

describe('supportsPlanChange capability', () => {
  it('is true only for native-swap providers in the static map', () => {
    expect(PROVIDER_CAPABILITIES.stripe.supportsPlanChange).toBe(true)
    expect(PROVIDER_CAPABILITIES.lemonsqueezy.supportsPlanChange).toBe(true)
    for (const slug of ['paypal', 'solana', 'solana_subs', 'manual', 'binance'] as const) {
      expect(PROVIDER_CAPABILITIES[slug].supportsPlanChange).toBe(false)
    }
  })

  it('matches each provider class instance (map stays in sync with classes)', () => {
    const cases: [{ provider: string; capabilities: { supportsPlanChange: boolean } }, boolean][] = [
      [new StripePaymentProvider('sk_test_x'), true],
      [new LemonSqueezyProvider('k', 's', 'w'), true],
      [new ManualPaymentProvider(), false],
      [new PayPalPaymentProvider('id', 'secret'), false],
    ]
    for (const [instance, expected] of cases) {
      expect(instance.capabilities.supportsPlanChange).toBe(expected)
      expect(
        PROVIDER_CAPABILITIES[instance.provider as keyof typeof PROVIDER_CAPABILITIES].supportsPlanChange,
      ).toBe(expected)
    }
  })

  it('exposes updateSubscription only on native-swap providers', () => {
    expect(typeof new StripePaymentProvider('sk_test_x').updateSubscription).toBe('function')
    expect(typeof new LemonSqueezyProvider('k', 's', 'w').updateSubscription).toBe('function')
    // updateSubscription is an OPTIONAL IPaymentProvider member these classes
    // omit — assert through the interface type so tsc is happy.
    expect((new ManualPaymentProvider() as IPaymentProvider).updateSubscription).toBeUndefined()
    expect((new PayPalPaymentProvider('id', 'secret') as IPaymentProvider).updateSubscription).toBeUndefined()
  })
})
