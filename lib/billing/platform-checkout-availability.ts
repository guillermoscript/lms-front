import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'

export type PlatformCheckoutUnavailableReason =
  | 'ready'
  | 'capability'
  | 'disabled'
  | 'missing_credentials'
  | 'provider_not_ready'
  | 'missing_price'
  | 'interval_mismatch'
  | 'currency_mismatch'

export interface PlatformProviderRuntimeStatus {
  /** Tenant-level payment setting. Platform health passes this as true. */
  enabled: boolean
  /** Global provider credentials/configuration are present. */
  configured: boolean
  /** Provider-specific runtime prerequisites are valid. */
  ready: boolean
}

export interface PlatformCheckoutPrice {
  interval: string
  currency: string
  providerPriceId: string | null
  amount: number | null
}

export interface PlatformCheckoutAvailability {
  provider: string
  interval: string
  available: boolean
  reason: PlatformCheckoutUnavailableReason
}

export interface EvaluatePlatformCheckoutAvailabilityInput {
  provider: string
  interval: string
  price: PlatformCheckoutPrice | null
  /** Platform plans are denominated in USD; callers may override for future plans. */
  expectedCurrency?: string
  /** Fallback list price used by catalog-less rails when row.amount is null. */
  fallbackAmount?: number | null
  runtime?: Partial<PlatformProviderRuntimeStatus>
}

/**
 * One predicate for every platform billing surface.
 *
 * Callers may gather runtime state differently (super-admin health has no tenant
 * setting, while an upgrade page has one), but the decision order and reason
 * codes stay identical. Provider identity is consulted only through the static
 * capability table.
 */
export function evaluatePlatformCheckoutAvailability(
  input: EvaluatePlatformCheckoutAvailabilityInput,
): PlatformCheckoutAvailability {
  const capability = PROVIDER_CAPABILITIES[input.provider as PaymentProvider]
  const runtime: PlatformProviderRuntimeStatus = {
    enabled: true,
    configured: true,
    ready: true,
    ...input.runtime,
  }

  const unavailable = (reason: PlatformCheckoutUnavailableReason): PlatformCheckoutAvailability => ({
    provider: input.provider,
    interval: input.interval,
    available: false,
    reason,
  })

  if (!capability?.supportsPlatformBillingCheckout) return unavailable('capability')
  if (!runtime.enabled) return unavailable('disabled')
  if (!runtime.configured) return unavailable('missing_credentials')
  if (!runtime.ready) return unavailable('provider_not_ready')
  if (!input.price) return unavailable('missing_price')
  if (input.price.interval !== input.interval) return unavailable('interval_mismatch')

  const expectedCurrency = (input.expectedCurrency ?? 'usd').toLowerCase()
  if (input.price.currency.toLowerCase() !== expectedCurrency) {
    return unavailable('currency_mismatch')
  }

  if (capability.createsCatalog && !input.price.providerPriceId) {
    return unavailable('missing_price')
  }

  if (
    !capability.createsCatalog &&
    input.price.amount === null &&
    !((input.fallbackAmount ?? 0) > 0)
  ) {
    return unavailable('missing_price')
  }

  return {
    provider: input.provider,
    interval: input.interval,
    available: true,
    reason: 'ready',
  }
}

export function platformCheckoutReasonLabel(reason: PlatformCheckoutUnavailableReason): string {
  switch (reason) {
    case 'capability':
      return 'Platform checkout capability disabled'
    case 'disabled':
      return 'Provider disabled in payment settings'
    case 'missing_credentials':
      return 'Provider credentials are missing'
    case 'provider_not_ready':
      return 'Provider runtime configuration is not ready'
    case 'missing_price':
      return 'Price is missing or incomplete'
    case 'interval_mismatch':
      return 'No price for this billing interval'
    case 'currency_mismatch':
      return 'Price currency does not match platform billing'
    case 'ready':
      return 'Ready for platform checkout'
  }
}
