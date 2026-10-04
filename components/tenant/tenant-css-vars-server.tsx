import {
  deriveKitStructure,
  deriveKitVars,
  type CSSVariableMap,
  type StoredKitTheme,
} from '@/lib/themes/kit'

function cssVarsToString(vars: CSSVariableMap): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n    ')
}

interface Props {
  /** The plan-resolved school theme (`resolveSchoolTheme`); null = platform palette. */
  theme?: StoredKitTheme | null
}

/**
 * Server component that writes the school's theme kit as one inline <style> in
 * the initial HTML, so there is no flash of platform colours and a light/dark
 * toggle needs no client re-apply: `:root` carries the light colours plus the
 * mode-independent fonts and corners, `.dark` the dark colours. `.dark` sits
 * on the same <html> as `:root`, so structure is emitted once.
 *
 * No theme renders nothing and the platform palette in globals.css applies.
 */
export function TenantCssVarsServer({ theme }: Props) {
  if (!theme) return null

  const { light, dark } = deriveKitVars(theme.theme, theme.brand)
  const root = { ...light, ...deriveKitStructure(theme.theme) }
  const css =
    `:root {\n    ${cssVarsToString(root)}\n  }\n` +
    `  .dark {\n    ${cssVarsToString(dark)}\n  }\n`

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
