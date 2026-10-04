import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTimeZone } from '@/lib/format-date-time'

/**
 * The zone a school's timestamps are shown in — `tenant_settings.timezone`,
 * the same key Settings → General edits (issue #727).
 *
 * Falls back to the value the general-settings form shows for an unset row,
 * so what the admin reads in Settings and what the payment screens use never
 * disagree. Read with the service-role client because students (who have no
 * RLS path to `tenant_settings`) see these timestamps too; the key is not
 * secret. Wrapped in React `cache()` so a page that formats twenty rows pays
 * for one read.
 */
export const FALLBACK_TENANT_TIME_ZONE = 'America/New_York'

export const getTenantTimeZone = cache(async (tenantId: string): Promise<string> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('tenant_settings')
      .select('setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', 'timezone')
      .maybeSingle()
    const value = (data?.setting_value as { value?: unknown } | null)?.value
    const candidate = typeof value === 'string' && value.trim() ? value.trim() : FALLBACK_TENANT_TIME_ZONE
    return resolveTimeZone(candidate)
  } catch (error) {
    console.error('Error resolving tenant timezone:', error)
    return FALLBACK_TENANT_TIME_ZONE
  }
})
