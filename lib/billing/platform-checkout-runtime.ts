import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlatformSolanaConfig } from '@/lib/billing/solana-platform-payment'
import { PLAN_PRICE_PROVIDERS } from '@/lib/billing/plan-prices'
import type {
  PaymentProvider,
} from '@/lib/payments/types'
import type { PlatformProviderRuntimeStatus } from '@/lib/billing/platform-checkout-availability'

const REQUIRED_ENV: Partial<Record<PaymentProvider, string[]>> = {
  stripe: ['STRIPE_SECRET_KEY'],
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
  for (const setting of Object.values(TENANT_SETTING_BY_PROVIDER)) {
    if (!setting) continue
    const { data } = await admin
      .from('tenant_settings')
      .select('setting_key, setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', setting)
      .maybeSingle()
    if (data) {
      settings.set(
        setting,
        (data.setting_value as { enabled?: boolean } | null)?.enabled === true,
      )
    }
  }

  return Object.fromEntries(
    Object.entries(getPlatformProviderRuntimeStatuses()).map(([provider, status]) => {
      const setting = TENANT_SETTING_BY_PROVIDER[provider as PaymentProvider]
      const enabled = setting ? (settings.has(setting) ? settings.get(setting)! : provider === 'stripe') : true
      return [provider, { ...status, enabled }]
    }),
  )
}
