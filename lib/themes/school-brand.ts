/**
 * Loads a school's brand for what it sends out — emails, certificates, share
 * images (issue #765). Works from any server context: server actions, route
 * handlers, webhooks and cron jobs. It takes the tenant id as an argument and
 * uses the service-role client, so it never needs request headers or cookies.
 *
 * Mirrors the root layout's resolution (`app/[locale]/layout.tsx`): `site_name`
 * and `logo_url` settings override the `tenants` columns, and the theme is
 * gated by plan through `resolveSchoolTheme` (a custom colour needs
 * `custom_branding`). No theme row means the platform palette.
 *
 * Never throws: a branding read that fails must not stop an enrollment email
 * or a certificate. It logs and falls back to the platform palette.
 */

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPlanFeature } from '@/lib/plans/server'
import { resolveSchoolTheme, SCHOOL_THEME_SETTING_KEY, type StoredKitTheme } from '@/lib/themes/kit'
import { deriveBrandOutputs, normalizeLogoUrl, type BrandOutputs } from '@/lib/themes/brand-outputs'

export interface SchoolBrand {
  tenantId: string
  /** The `site_name` setting, else `tenants.name`; empty only when the tenant row is missing. */
  name: string
  /** An absolute http(s) logo URL (`logo_url` setting, else `tenants.logo_url`), or `null`. */
  logoUrl: string | null
  /** The plan-resolved theme, or `null` on the platform palette. */
  theme: StoredKitTheme | null
  outputs: BrandOutputs
}

function settingText(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const text = (value as { value?: unknown }).value
  return typeof text === 'string' && text.trim() ? text.trim() : null
}

/** The platform-palette brand for a tenant whose branding could not be read. */
export function platformSchoolBrand(tenantId: string, name = ''): SchoolBrand {
  return { tenantId, name, logoUrl: null, theme: null, outputs: deriveBrandOutputs(null) }
}

export const getSchoolBrand = cache(async (tenantId: string): Promise<SchoolBrand> => {
  try {
    const admin = createAdminClient()
    const [tenantResult, settingsResult, customBranding] = await Promise.all([
      admin.from('tenants').select('name, logo_url').eq('id', tenantId).maybeSingle(),
      admin
        .from('tenant_settings')
        .select('setting_key, setting_value')
        .eq('tenant_id', tenantId)
        .in('setting_key', ['site_name', 'logo_url', SCHOOL_THEME_SETTING_KEY]),
      hasPlanFeature(tenantId, 'custom_branding'),
    ])
    if (tenantResult.error) throw tenantResult.error
    if (settingsResult.error) throw settingsResult.error

    const settings = new Map<string, unknown>(
      (settingsResult.data ?? []).map((row) => [row.setting_key as string, row.setting_value])
    )
    const tenant = tenantResult.data as { name: string | null; logo_url: string | null } | null
    const theme = resolveSchoolTheme(settings.get(SCHOOL_THEME_SETTING_KEY), { customBranding })

    return {
      tenantId,
      name: settingText(settings.get('site_name')) ?? tenant?.name ?? '',
      logoUrl: normalizeLogoUrl(settingText(settings.get('logo_url')) ?? tenant?.logo_url),
      theme,
      outputs: deriveBrandOutputs(theme),
    }
  } catch (error) {
    console.error('[school-brand] falling back to the platform palette for tenant', tenantId, error)
    return platformSchoolBrand(tenantId)
  }
})
