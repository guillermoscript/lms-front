'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track, safeAnalytics } from '@/lib/analytics/server'
import { revalidatePath } from 'next/cache'
import { isPlanFeatureError, planFeatureErrorMessage, requirePlanFeature } from '@/lib/plans/server'
import {
  isKitSwatch,
  parseStoredKitTheme,
  SCHOOL_THEME_SETTING_KEY,
  type KitThemeId,
  type StoredKitTheme,
} from '@/lib/themes/kit'

export interface ThemeActionResult {
  success: boolean
  error?: string
  /** The school's theme after the action; null = platform palette. */
  data?: StoredKitTheme | null
}

/**
 * §9.5 — an owner who brands their school is invested, which makes this a
 * strong activation proxy. `change` tells a theme pick from a reset.
 */
async function trackThemeCustomized(
  tenantId: string,
  properties: { theme: KitThemeId | null; custom: boolean; change: 'theme' | 'reset' }
): Promise<void> {
  // Wrapped: `getCurrentUserId()` is evaluated as an ARGUMENT, so it runs
  // before `track()`'s own guard could catch anything it throws — and every
  // caller awaits this after the theme has already been written.
  return safeAnalytics(async () => {
    await track(ANALYTICS_EVENTS.THEME_CUSTOMIZED, properties, {
      userId: await getCurrentUserId(),
      tenantId,
      role: 'admin',
    })
  }, 'theme_customized')
}

/**
 * Save the school's look: one of the four kit themes plus a brand colour
 * (#763). Every plan may pick a theme and one of its recommended swatches; a
 * brand outside that theme's swatches is a custom colour and needs
 * `custom_branding` (Business+). The layout applies the same rule when it
 * renders (`resolveSchoolTheme`), since tenant admins can also write
 * `tenant_settings` directly under RLS.
 */
export async function applyKitTheme(input: { theme: string; brand: string }): Promise<ThemeActionResult> {
  const role = await getUserRole()
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  // Server actions take untrusted input: validate the whole shape, not the types.
  const raw = (input ?? {}) as Partial<Record<'theme' | 'brand', unknown>>
  const stored = parseStoredKitTheme({ type: 'kit', theme: raw.theme, brand: raw.brand })
  if (!stored) return { success: false, error: 'Invalid theme or colour' }

  const tenantId = await getCurrentTenantId()
  const custom = !isKitSwatch(stored.theme, stored.brand)
  if (custom) {
    try {
      await requirePlanFeature(tenantId, 'custom_branding')
    } catch (err) {
      if (isPlanFeatureError(err)) return { success: false, error: planFeatureErrorMessage(err) }
      throw err
    }
  }

  const { error } = await createAdminClient()
    .from('tenant_settings')
    .upsert(
      { tenant_id: tenantId, setting_key: SCHOOL_THEME_SETTING_KEY, setting_value: stored },
      { onConflict: 'tenant_id,setting_key' }
    )
  if (error) {
    console.error('applyKitTheme failed:', error)
    return { success: false, error: 'Failed to save theme' }
  }

  await trackThemeCustomized(tenantId, { theme: stored.theme, custom, change: 'theme' })
  revalidatePath('/', 'layout')
  return { success: true, data: stored }
}

/** Remove the school's theme so it renders the platform palette. Open to every plan. */
export async function resetSchoolTheme(): Promise<ThemeActionResult> {
  const role = await getUserRole()
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  const tenantId = await getCurrentTenantId()
  const { error } = await createAdminClient()
    .from('tenant_settings')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('setting_key', SCHOOL_THEME_SETTING_KEY)
  if (error) {
    console.error('resetSchoolTheme failed:', error)
    return { success: false, error: 'Failed to reset theme' }
  }

  await trackThemeCustomized(tenantId, { theme: null, custom: false, change: 'reset' })
  revalidatePath('/', 'layout')
  return { success: true, data: null }
}

/**
 * The current school's stored theme, validated but NOT plan-resolved. Callers
 * resolve it with `resolveSchoolTheme` for display; the raw value is kept so a
 * custom colour masked by the current plan survives in the row and returns on
 * upgrade.
 */
export async function getSchoolTheme(): Promise<StoredKitTheme | null> {
  const tenantId = await getCurrentTenantId()
  const { data } = await createAdminClient()
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', SCHOOL_THEME_SETTING_KEY)
    .maybeSingle()

  return parseStoredKitTheme(data?.setting_value)
}
