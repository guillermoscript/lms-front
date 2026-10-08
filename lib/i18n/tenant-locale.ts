import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveDigestSettings } from '@/lib/notifications/daily-digest'

/**
 * Best-effort per-tenant reading language for crons (no request scope).
 * Nothing stores a per-student locale, and a cron tick runs outside
 * next-intl's request scope, so `bestEffortLocaleOr()` would always resolve
 * to its fallback there. `tenant_settings.daily_digest` is the only per-tenant
 * language signal that already exists — reused rather than adding a second
 * place a school sets its language. Falls back to `en`.
 *
 * Extracted from `app/api/cron/expire-payment-requests` for the platform fee
 * cron (#929, design 4.4).
 */
export async function resolveTenantLocale(admin: SupabaseClient, tenantId: string): Promise<'en' | 'es'> {
  const { data } = await admin
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', 'daily_digest')
    .maybeSingle()
  return resolveDigestSettings(data?.setting_value).locale
}
