import { getPresetById, FONT_OPTIONS, type StoredPreset, type CSSVariableMap } from '@/lib/themes/presets'

/**
 * Resolves CSS variable maps from a StoredPreset.
 * Shared between server (inline <style>) and client (dark/light switching).
 */
export function resolvePresetVars(storedPreset: StoredPreset): {
  light?: CSSVariableMap
  dark?: CSSVariableMap
} {
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

  if (themePreset) {
    const { light, dark } = resolvePresetVars(themePreset)

    // Build light mode vars
    if (light) {
      const lightVars = { ...light }
      if (themePreset.radius) lightVars['--radius'] = themePreset.radius
      if (themePreset.fontFamily) lightVars['--font-sans'] = `"${themePreset.fontFamily}", sans-serif`
      css += `:root {\n    ${cssVarsToString(lightVars)}\n  }\n`
    }

    // Build dark mode vars
    if (dark) {
      const darkVars = { ...dark }
      if (themePreset.radius) darkVars['--radius'] = themePreset.radius
      if (themePreset.fontFamily) darkVars['--font-sans'] = `"${themePreset.fontFamily}", sans-serif`
      css += `  .dark {\n    ${cssVarsToString(darkVars)}\n  }\n`
    }
  } else {
    // Legacy fallback: individual color overrides
    const overrides: string[] = []
    if (primaryColor) {
      overrides.push(`--primary: ${primaryColor};`)
      overrides.push(`--sidebar-primary: ${primaryColor};`)
      overrides.push(`--accent: ${primaryColor};`)
    }
    if (secondaryColor) {
      overrides.push(`--secondary-brand: ${secondaryColor};`)
    }
    if (overrides.length > 0) {
      css = `:root {\n    ${overrides.join('\n    ')}\n  }\n`
    }
  }

  if (!css) return null

  // Build font preload link if custom font is set
  const fontLink = themePreset?.fontFamily
    ? FONT_OPTIONS.find((f) => f.value === themePreset.fontFamily)
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
