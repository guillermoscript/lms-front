import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlatformSolanaConfig } from '@/lib/billing/solana-platform-payment'
import { PLAN_PRICE_PROVIDERS } from '@/lib/billing/plan-prices'
import type {
  PaymentProvider,
} from '@/lib/payments/types'
import type { PlatformProviderRuntimeStatus } from '@/lib/billing/platform-checkout-availability'

const REQUIRED_ENV: Partial<Record<PaymentProvider, string[]>> = {
  // Platform Stripe checkout is not executable without the separate webhook
  // secret: the hosted session can be created with STRIPE_SECRET_KEY, but the
  // subscription would never activate when /api/billing/webhook/stripe cannot
  // verify the completion event.
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_PLATFORM_WEBHOOK_SECRET'],
  paypal: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
  binance: ['BINANCE_PAY_API_KEY', 'BINANCE_PAY_API_SECRET'],
  lemonsqueezy: ['LEMONSQUEEZY_API_KEY', 'LEMONSQUEEZY_STORE_ID', 'LEMONSQUEEZY_WEBHOOK_SECRET'],
  solana: ['SOLANA_RPC_URL', 'SOLANA_PLATFORM_WALLET'],
}

/**
 * Resolve global provider configuration without constructing a provider or
 * exposing credentials. `ready` catches syntactically invalid Solana config;
 * other providers currently have no separate readiness handshake.
 */
export function getPlatformProviderRuntimeStatuses(): Record<string, PlatformProviderRuntimeStatus> {
  return Object.fromEntries(
    PLAN_PRICE_PROVIDERS.map((provider) => {
      const required = REQUIRED_ENV[provider as PaymentProvider] ?? []
      const configured = required.every((key) => Boolean(process.env[key]))
      const ready = provider === 'solana' ? configured && Boolean(getPlatformSolanaConfig()) : configured
      return [provider, { enabled: true, configured, ready }]
    }),
  )
}

const TENANT_SETTING_BY_PROVIDER: Partial<Record<PaymentProvider, string>> = {
  stripe: 'stripe_enabled',
  paypal: 'paypal_enabled',
  lemonsqueezy: 'lemonsqueezy_enabled',
  binance: 'binance_enabled',
  solana: 'solana_enabled',
}

/** Resolve tenant payment toggles used by the school upgrade surface/API. */
export async function getTenantPlatformProviderStatuses(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Record<string, PlatformProviderRuntimeStatus>> {
  const settings = new Map<string, boolean>()
  const settingKeys = Object.values(TENANT_SETTING_BY_PROVIDER).filter(
    (setting): setting is string => Boolean(setting),
  )
  const { data, error } = await admin
    .from('tenant_settings')
    .select('setting_key, setting_value')
    .eq('tenant_id', tenantId)
    .in('setting_key', settingKeys)

  // A settings read failure must not silently fall back to Stripe-enabled
  // defaults and create a checkout the tenant explicitly disabled.
  if (error) throw new Error(`Failed to read tenant payment settings: ${error.message}`)

  for (const row of data ?? []) {
    settings.set(
      row.setting_key,
      (row.setting_value as { enabled?: boolean } | null)?.enabled === true,
    )
  }

  return Object.fromEntries(
    Object.entries(getPlatformProviderRuntimeStatuses()).map(([provider, status]) => {
      const setting = TENANT_SETTING_BY_PROVIDER[provider as PaymentProvider]
      const enabled = setting ? (settings.has(setting) ? settings.get(setting)! : provider === 'stripe') : true
      return [provider, { ...status, enabled }]
    }),
  )
}
