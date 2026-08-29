/**
 * What Settings → Payments says about each rail, derived from the capability
 * table rather than retyped next to the toggles.
 *
 * The old settings form described six providers with six hand-written hints
 * ("Enable Stripe payment processing"), which restated the provider's own name
 * and answered none of the questions an admin actually has: where does the
 * money land, can I sell a subscription on this, can I refund from inside the
 * app. Those answers already exist, precisely, in `PROVIDER_CAPABILITIES` —
 * they were simply never surfaced. Reading them from there means the settings
 * screen cannot drift away from what checkout will really do.
 *
 * This module is deliberately PURE and i18n-free: it decides WHICH facts a rail
 * should advertise, and the component maps each fact to a translated label.
 * Nothing here is user-visible text.
 */

import { PROVIDER_CAPABILITIES, type PaymentProvider } from './types'

/** Providers an admin can switch on in Settings → Payments. */
export type ConfigurableProvider = Extract<
  PaymentProvider,
  'stripe' | 'paypal' | 'lemonsqueezy' | 'binance' | 'binance_personal' | 'solana' | 'manual'
>

/**
 * Where the student's money physically lands, which is the single fact the old
 * screen hid and the one that most changes an admin's choice.
 *
 * `direct` — settles into the school's own account/wallet; the school is paid
 * at purchase time. `platform` — settles into a platform-owned merchant
 * account, and the school is paid later through the payouts flow. An admin
 * choosing PayPal or Lemon Squeezy is opting into being paid on OUR schedule
 * rather than the provider's, and nothing on the old screen said so.
 */
export type SettlementRoute = 'direct' | 'platform'

/** A short fact chip shown under the provider name. */
export interface ProviderFact {
  /** Stable id → i18n key under `…payment.facts.*`, and a test selector. */
  id:
    | 'settlesDirect'
    | 'settlesPlatform'
    | 'subscriptions'
    | 'oneTimeOnly'
    | 'refundsInApp'
    | 'refundsManual'
    | 'merchantOfRecord'
    | 'noPlatformFee'
  /**
   * Chips that carry a caveat the admin should weigh (paid out later, refunds
   * are manual, one-time only) render muted-but-present rather than as an
   * error. Purely a styling hint — never a validity signal.
   */
  tone: 'neutral' | 'caveat' | 'good'
}

/**
 * The one-time rail is what an admin toggles; `solana_subs` rides along on the
 * same wallet and the same switch, so Solana's advertised capabilities are the
 * UNION of the two rows. Without this, the Solana row would claim "one-time
 * only" while `getEnabledProviders()` quietly enables recurring crypto too.
 */
const CAPABILITY_ALIASES: Partial<Record<ConfigurableProvider, PaymentProvider[]>> = {
  solana: ['solana', 'solana_subs'],
}

function capabilitiesFor(provider: ConfigurableProvider) {
  const rows = (CAPABILITY_ALIASES[provider] ?? [provider]).map(
    (p) => PROVIDER_CAPABILITIES[p]
  )
  return {
    supportsSubscriptions: rows.some((r) => r.supportsNativeSubscriptions),
    supportsRefunds: rows.some((r) => r.supportsRefunds),
    isMerchantOfRecord: rows.some((r) => r.isMerchantOfRecord),
    bearsPlatformFee: rows.some((r) => r.bearsPlatformFee),
    settlesToPlatformAccount: rows.some((r) => r.settlesToPlatformAccount),
    requiresConnectedAccount: rows.some((r) => r.requiresConnectedAccount),
  }
}

/** Where this rail settles, for the row's payout chip. */
export function settlementRoute(provider: ConfigurableProvider): SettlementRoute {
  return capabilitiesFor(provider).settlesToPlatformAccount ? 'platform' : 'direct'
}

/**
 * The facts a provider row advertises, in a fixed order so the rows scan as a
 * column rather than as seven unrelated sentences.
 */
export function providerFacts(provider: ConfigurableProvider): ProviderFact[] {
  const caps = capabilitiesFor(provider)
  const facts: ProviderFact[] = []

  facts.push(
    caps.settlesToPlatformAccount
      ? { id: 'settlesPlatform', tone: 'caveat' }
      : { id: 'settlesDirect', tone: 'good' }
  )

  facts.push(
    caps.supportsSubscriptions
      ? { id: 'subscriptions', tone: 'neutral' }
      : { id: 'oneTimeOnly', tone: 'caveat' }
  )

  facts.push(
    caps.supportsRefunds
      ? { id: 'refundsInApp', tone: 'neutral' }
      : { id: 'refundsManual', tone: 'caveat' }
  )

  // Merchant of Record is a genuine selling point (they remit VAT for you), so
  // it earns a chip only where true rather than a "you handle tax" counterpart.
  if (caps.isMerchantOfRecord) facts.push({ id: 'merchantOfRecord', tone: 'good' })

  // Rails where the money never touches a platform account carry no platform
  // fee. Stated plainly because the alternative — an admin discovering it from
  // a payout statement — is worse.
  if (!caps.bearsPlatformFee) facts.push({ id: 'noPlatformFee', tone: 'good' })

  return facts
}

/**
 * Does this provider need setup beyond flipping the switch, and of what kind?
 *
 * `connect` — an external onboarding flow (Stripe Express KYC).
 * `wallet` — a receiving address or credentials the admin pastes in-app.
 * `catalog` — nothing tenant-level, but each plan/product needs an id pasted on
 *   it (Lemon Squeezy variant ids), so the row must say so or the first sale
 *   fails on an offering the admin believed was live.
 * `none` — usable the moment it is switched on.
 */
export type SetupKind = 'connect' | 'wallet' | 'catalog' | 'none'

export function setupKind(provider: ConfigurableProvider): SetupKind {
  if (capabilitiesFor(provider).requiresConnectedAccount) return 'connect'
  if (provider === 'solana' || provider === 'binance_personal') return 'wallet'
  if (provider === 'lemonsqueezy') return 'catalog'
  return 'none'
}

/**
 * Row status, the thing the old screen only ever computed for Stripe — and
 * then rendered as a page-wide alarm regardless of whether Stripe was even on.
 *
 * The ordering here is the whole point: a provider that is OFF is never an
 * alarm, however unconfigured it is. Only "on and unusable" is a problem worth
 * colouring, because that is the state that silently loses sales.
 */
export type ProviderStatus =
  /** Switched off. Setup state is irrelevant and must not shout. */
  | 'off'
  /** On, configured, taking money. */
  | 'ready'
  /** On, but setup is unfinished — students cannot pay on this rail. */
  | 'blocked'
  /** Off and never configured; shown muted as an invitation, not a warning. */
  | 'notConfigured'

export function providerStatus(enabled: boolean, configured: boolean): ProviderStatus {
  if (!enabled) return configured ? 'off' : 'notConfigured'
  return configured ? 'ready' : 'blocked'
}
