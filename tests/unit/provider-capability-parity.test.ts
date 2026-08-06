import { describe, it, expect } from 'vitest'
import {
  PROVIDER_CAPABILITIES,
  type IPaymentProvider,
  type PaymentProvider,
  type ProviderCapabilities,
} from '@/lib/payments/types'
import { StripePaymentProvider } from '@/lib/payments/stripe-provider'
import { PayPalPaymentProvider } from '@/lib/payments/paypal-provider'
import { LemonSqueezyProvider } from '@/lib/payments/lemonsqueezy-provider'
import { SolanaProvider } from '@/lib/payments/solana-provider'
import { SolanaSubscriptionsProvider } from '@/lib/payments/solana-subscriptions-provider'
import { ManualPaymentProvider } from '@/lib/payments/manual-provider'
import { BinancePayProvider } from '@/lib/payments/binance-provider'
import { BinancePersonalProvider } from '@/lib/payments/binance-personal-provider'

/**
 * The static `PROVIDER_CAPABILITIES` table and each provider class's own
 * `capabilities` literal are two hand-maintained copies of the same facts. The
 * table's comment has asked for them to be kept in step since #601; this test
 * is what makes that mechanical instead of aspirational.
 *
 * It matters because the two are read by DIFFERENT callers: credential-free
 * code (the expiry cron, server actions, the billing page) reads the table
 * without instantiating anything, while code that already holds a provider
 * reads the instance. A flag that disagrees between them means two shipped
 * screens can answer the same question differently — exactly the failure #547
 * hit with `revenue_splits.applies_to_providers`.
 *
 * Constructed with dummy credentials on purpose: `capabilities` is a static
 * declaration, so no constructor here performs I/O or validates a key.
 */

// Every provider class, instantiated cheaply. Adding a provider without adding
// it here fails the exhaustiveness check below rather than silently skipping.
// Typed as the interface, not the union of concrete classes: the optional
// members below (createCustomerPortalSession, previewSubscriptionChange) are
// declared on `IPaymentProvider`, and checking that a class which CLAIMS the
// capability actually has the method is the point of the last test here.
const INSTANCES: IPaymentProvider[] = [
  new StripePaymentProvider('sk_test_dummy'),
  new PayPalPaymentProvider('client-id', 'client-secret'),
  new LemonSqueezyProvider('api-key', 'store-id', 'webhook-secret'),
  new SolanaProvider('https://rpc.example.invalid'),
  new SolanaSubscriptionsProvider(),
  new ManualPaymentProvider(),
  new BinancePayProvider('binance-key', 'binance-secret'),
  new BinancePersonalProvider(),
]

const CAPABILITY_KEYS = Object.keys(
  PROVIDER_CAPABILITIES.stripe,
) as (keyof ProviderCapabilities)[]

describe('provider capabilities — table ↔ class parity', () => {
  it('covers every provider slug in the static table', () => {
    const instanceSlugs = INSTANCES.map((p) => p.provider).sort()
    const tableSlugs = (Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]).sort()
    expect(instanceSlugs).toEqual(tableSlugs)
  })

  it.each(INSTANCES.map((p) => [p.provider, p] as const))(
    '%s: class capabilities equal the static table entry',
    (slug, instance) => {
      expect(instance.capabilities).toEqual(PROVIDER_CAPABILITIES[slug as PaymentProvider])
    },
  )

  it.each(INSTANCES.map((p) => [p.provider, p] as const))(
    '%s: declares every capability key explicitly (no undefined, no extras)',
    (slug, instance) => {
      // `toEqual` above ignores a key that is `undefined` on both sides, which
      // is precisely how a newly added capability goes unnoticed on a provider.
      const declared = Object.keys(instance.capabilities).sort()
      expect(declared).toEqual([...CAPABILITY_KEYS].sort())
      for (const key of CAPABILITY_KEYS) {
        expect(typeof instance.capabilities[key], `${slug}.${key}`).toBe('boolean')
        expect(
          typeof PROVIDER_CAPABILITIES[slug as PaymentProvider][key],
          `PROVIDER_CAPABILITIES.${slug}.${key}`,
        ).toBe('boolean')
      }
    },
  )
})

describe('supportsCustomerPortal / supportsProrationPreview (#604)', () => {
  it('is Stripe-only for both, in the table', () => {
    expect(PROVIDER_CAPABILITIES.stripe.supportsCustomerPortal).toBe(true)
    expect(PROVIDER_CAPABILITIES.stripe.supportsProrationPreview).toBe(true)
    for (const slug of [
      'paypal',
      'lemonsqueezy',
      'solana',
      'solana_subs',
      'manual',
      'binance',
      'binance_personal',
    ] as const) {
      expect(PROVIDER_CAPABILITIES[slug].supportsCustomerPortal).toBe(false)
      expect(PROVIDER_CAPABILITIES[slug].supportsProrationPreview).toBe(false)
    }
  })

  it('a provider that claims a capability actually implements the method', () => {
    // The reverse of the usual gate: the app trusts the flag, so a `true` with
    // no implementation would throw at the call site rather than degrade.
    for (const instance of INSTANCES) {
      if (instance.capabilities.supportsCustomerPortal) {
        expect(typeof instance.createCustomerPortalSession, instance.provider).toBe('function')
      }
      if (instance.capabilities.supportsProrationPreview) {
        expect(typeof instance.previewSubscriptionChange, instance.provider).toBe('function')
      }
      if (instance.capabilities.supportsPlanChange) {
        expect(typeof instance.updateSubscription, instance.provider).toBe('function')
      }
    }
  })

  it('quoting is never claimed without the ability to make the change', () => {
    // A quote for a swap we cannot perform would be a preview of nothing.
    for (const slug of Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]) {
      const caps = PROVIDER_CAPABILITIES[slug]
      if (caps.supportsProrationPreview) {
        expect(caps.supportsPlanChange, slug).toBe(true)
      }
    }
  })
})
