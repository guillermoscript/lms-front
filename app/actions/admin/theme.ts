'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'
import { CURATED_PRESETS, RADIUS_OPTIONS, FONT_OPTIONS, type StoredPreset, type CSSVariableMap } from '@/lib/themes/presets'

interface ThemeActionResult {
  success: boolean
  error?: string
  data?: StoredPreset
}

/**
 * Apply a curated preset to the current tenant.
 */
export async function applyCuratedPreset(presetId: string): Promise<ThemeActionResult> {
  const role = await getUserRole()
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  const preset = CURATED_PRESETS.find((p) => p.id === presetId)
  if (!preset) return { success: false, error: 'Preset not found' }

  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  const stored: StoredPreset = { type: 'curated', id: presetId }

  const { error } = await supabase
    .from('tenant_settings')
    .upsert(
      { tenant_id: tenantId, setting_key: 'theme_preset', setting_value: stored },
      { onConflict: 'tenant_id,setting_key' }
    )

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')

  return { success: true, data: stored }
}

/**
 * Fetch a custom preset from the shadcn registry by preset code,
 * then store the CSS variables for runtime use.
 *
 * The shadcn registry exposes preset data at:
 * https://ui.shadcn.com/r/presets/{code}.json
 *
 * The response contains cssVars.light / cssVars.dark maps.
 */
export async function applyCustomPreset(presetCode: string): Promise<ThemeActionResult> {
  const role = await getUserRole()
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  if (!/^[a-zA-Z0-9_-]{4,32}$/.test(presetCode)) {
    return { success: false, error: 'Invalid preset code format' }
  }

  // Fetch from shadcn init endpoint — returns a project scaffold
  // with a globals.css file containing all CSS variables
  let variables: { light: CSSVariableMap; dark: CSSVariableMap }
  try {
    const res = await fetch(`https://ui.shadcn.com/init/v0?preset=${presetCode}`, {
      next: { revalidate: 3600 }, // cache 1h
    })
    if (!res.ok) {
      return {
        success: false,
        error: `Preset "${presetCode}" not found in shadcn registry (${res.status})`,
      }
    }
    const json = await res.json()

    // Find globals.css in the files array
    const globalsFile = json.files?.find(
      (f: { path: string }) => f.path === 'app/globals.css'
    )
    if (!globalsFile?.content) {
      return { success: false, error: 'Could not find CSS variables in preset' }
    }

    // Parse CSS variables from :root { ... } and .dark { ... } blocks
    variables = parseCssVariables(globalsFile.content)
    if (!variables.light['--primary'] || !variables.dark['--primary']) {
      return { success: false, error: 'Could not parse theme variables from preset' }
    }
  } catch {
    return { success: false, error: 'Failed to fetch preset from shadcn registry' }
  }

  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  const stored: StoredPreset = {
    type: 'custom',
    id: `custom-${presetCode}`,
    presetCode,
    variables,
  }

  const { error } = await supabase
    .from('tenant_settings')
    .upsert(
      { tenant_id: tenantId, setting_key: 'theme_preset', setting_value: stored },
      { onConflict: 'tenant_id,setting_key' }
    )

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')

  return { success: true, data: stored }
}

/**
 * Remove the custom theme and revert to the default preset.
 */
export async function resetThemePreset(): Promise<ThemeActionResult> {
  const role = await getUserRole()
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  const defaultPreset: StoredPreset = { type: 'curated', id: 'default' }

  const { error } = await supabase
    .from('tenant_settings')
    .upsert(
      { tenant_id: tenantId, setting_key: 'theme_preset', setting_value: defaultPreset },
      { onConflict: 'tenant_id,setting_key' }
    )

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')

  return { success: true, data: defaultPreset }
}

/**
 * Update the border radius for the current tenant's theme.
 * Merges with the existing preset (preserves colors).
 */
export async function updateRadius(radius: string): Promise<ThemeActionResult> {
  const role = await getUserRole()
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  if (!RADIUS_OPTIONS.some((o) => o.value === radius)) {
    return { success: false, error: 'Invalid radius value' }
  }

  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  // Read existing preset and merge radius
  const existing = await getActivePreset()
  const stored: StoredPreset = existing
    ? { ...existing, radius }
    : { type: 'curated', id: 'default', radius }

  const { error } = await supabase
    .from('tenant_settings')
    .upsert(
      { tenant_id: tenantId, setting_key: 'theme_preset', setting_value: stored },
      { onConflict: 'tenant_id,setting_key' }
    )

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')

  return { success: true, data: stored }
}

/**
 * Update the font family for the current tenant's theme.
 * Merges with the existing preset (preserves colors + radius).
 */
export async function updateFont(fontFamily: string): Promise<ThemeActionResult> {
  const role = await getUserRole()
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  if (!FONT_OPTIONS.some((f) => f.value === fontFamily)) {
    return { success: false, error: 'Invalid font family' }
  }

  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  const existing = await getActivePreset()
  const stored: StoredPreset = existing
    ? { ...existing, fontFamily }
    : { type: 'curated', id: 'default', fontFamily }

  const { error } = await supabase
    .from('tenant_settings')
    .upsert(
      { tenant_id: tenantId, setting_key: 'theme_preset', setting_value: stored },
      { onConflict: 'tenant_id,setting_key' }
    )

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')

  return { success: true, data: stored }
}

/**
 * Get the active preset for the current tenant.
 */
export async function getActivePreset(): Promise<StoredPreset | null> {
  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', 'theme_preset')
    .single()

  return (data?.setting_value as StoredPreset) ?? null
}

/**
 * Parse CSS custom properties from a globals.css string.
 * Extracts variables from :root { ... } (light) and .dark { ... } (dark) blocks.
 */
function parseCssVariables(css: string): { light: CSSVariableMap; dark: CSSVariableMap } {
  const light: CSSVariableMap = {}
  const dark: CSSVariableMap = {}

  // Match :root { ... } block
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/)
  if (rootMatch) {
    parseBlock(rootMatch[1], light)
  }

  // Match .dark { ... } block
  const darkMatch = css.match(/\.dark\s*\{([^}]+)\}/)
  if (darkMatch) {
    parseBlock(darkMatch[1], dark)
  }

  return { light, dark }
}

function parseBlock(block: string, target: CSSVariableMap) {
  const lines = block.split('\n')
  for (const line of lines) {
    const match = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/)
    if (match) {
      target[match[1]] = match[2]
    }
  }
}
