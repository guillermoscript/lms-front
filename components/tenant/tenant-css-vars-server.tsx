import { readableOn } from '@/lib/color/contrast'
import { deriveKitStructure, deriveKitVars } from '@/lib/themes/kit'
import { getPresetById, FONT_OPTIONS, type StoredPreset, type CSSVariableMap } from '@/lib/themes/presets'

/**
 * Resolves the light and dark CSS variable maps for a StoredPreset.
 * Consumed by TenantCssVarsServer, which emits both sets in one server
 * <style> (`:root` + `.dark`) so a light/dark toggle needs no client re-apply.
 *
 * - kit     → derived from theme + brand colour (lib/themes/kit.ts)
 * - curated → looked up in CURATED_PRESETS by id
 * - custom  → the variables stored inline on the preset
 */
export function resolvePresetVars(storedPreset: StoredPreset): {
  light?: CSSVariableMap
  dark?: CSSVariableMap
} {
  if (storedPreset.type === 'kit') {
    return deriveKitVars(storedPreset.theme, storedPreset.brand)
  }
  if (storedPreset.type === 'curated') {
    const preset = getPresetById(storedPreset.id)
    return { light: preset?.variables.light, dark: preset?.variables.dark }
  }
  return { light: storedPreset.variables?.light, dark: storedPreset.variables?.dark }
}

function cssVarsToString(vars: CSSVariableMap): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n    ')
}

interface Props {
  themePreset?: StoredPreset | null
  primaryColor?: string
  secondaryColor?: string
}

/**
 * Server component that injects tenant CSS variables as an inline <style> tag
 * in the initial HTML. This eliminates the flash of default colors that occurs
 * when CSS variables are applied client-side via useEffect.
 */
export function TenantCssVarsServer({ themePreset, primaryColor, secondaryColor }: Props) {
  let css = ''

  // A kit preset owns its brand colour, corners and type pairing, so the
  // legacy radius/font overrides and the legacy primary_color override do not
  // apply to it.
  const isKit = themePreset?.type === 'kit'
  const radius = isKit ? undefined : themePreset?.radius
  const fontFamily = isKit ? undefined : themePreset?.fontFamily

  if (themePreset) {
    const { light, dark } = resolvePresetVars(themePreset)

    // Build light mode vars
    if (light) {
      const lightVars = { ...light }
      if (radius) lightVars['--radius'] = radius
      if (fontFamily) lightVars['--font-sans'] = `"${fontFamily}", sans-serif`
      // A kit's fonts and corners are the same in both modes, and `.dark` sits
      // on the same <html> as :root, so they are emitted once, here.
      if (themePreset.type === 'kit') Object.assign(lightVars, deriveKitStructure(themePreset.theme))
      css += `:root {\n    ${cssVarsToString(lightVars)}\n  }\n`
    }

    // Build dark mode vars
    if (dark) {
      const darkVars = { ...dark }
      if (radius) darkVars['--radius'] = radius
      if (fontFamily) darkVars['--font-sans'] = `"${fontFamily}", sans-serif`
      css += `  .dark {\n    ${cssVarsToString(darkVars)}\n  }\n`
    }
  }

  // Brand color overrides — applied AFTER any preset so an explicit brand color
  // always wins. Appended as the last :root rule so CSS cascade resolves to it.
  // These vars feed the primary accent surfaces used across the app + Puck blocks.
  const brandOverrides: string[] = []
  if (primaryColor && !isKit) {
    brandOverrides.push(`--primary: ${primaryColor};`)
    brandOverrides.push(`--sidebar-primary: ${primaryColor};`)
    brandOverrides.push(`--ring: ${primaryColor};`)

    // `--primary-foreground` is the text drawn on top of `--primary`, and the
    // stock value is a near-white. Overriding the brand colour without it left
    // every primary surface — buttons, the Puck hero/CTA/banner blocks, the
    // sidebar — white-on-pale for any school with a light brand colour (#569).
    // Derived only when the colour parses; an exotic value keeps the default.
    const primaryInk = readableOn(primaryColor, '')
    if (primaryInk) {
      brandOverrides.push(`--primary-foreground: ${primaryInk};`)
      brandOverrides.push(`--sidebar-primary-foreground: ${primaryInk};`)
    }
  }
  if (secondaryColor) {
    brandOverrides.push(`--secondary-brand: ${secondaryColor};`)
  }
  if (brandOverrides.length > 0) {
    css += `:root {\n    ${brandOverrides.join('\n    ')}\n  }\n`
  }

  if (!css) return null

  // Build font preload link if custom font is set
  const fontLink = fontFamily
    ? FONT_OPTIONS.find((f) => f.value === fontFamily)
    : null

  return (
    <>
      {fontLink && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${fontLink.googleFamily}&display=swap`}
        />
      )}
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </>
  )
}
