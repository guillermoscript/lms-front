import type { Field } from '@measured/puck'
import type { CSSProperties } from 'react'

/**
 * Shared "Accent Color" support for Puck LMS blocks.
 *
 * Branding-first, but optional: every accent block defaults to the tenant brand
 * color (`--primary`). An admin who wants a different color for one block can set
 * an explicit hex in the block's "Accent Color" field — leaving it empty keeps
 * the brand color.
 *
 * Usage in a component:
 *   fields:  { ..., accentColor: accentColorField }
 *   default: { ..., accentColor: '' }
 *   render:  ({ accentColor, ... }) => (
 *     <section style={accentVars(accentColor)}>
 *       <span className="text-[var(--block-accent)]">...</span>  // accent text
 *       <div className="bg-[color-mix(in_srgb,var(--block-accent)_10%,transparent)]" /> // accent tint
 *     </section>
 *   )
 *
 * `accentVars()` sets a block-scoped `--block-accent` CSS variable:
 *   - empty field → `--block-accent: var(--primary)` (tenant brand)
 *   - hex set     → `--block-accent: <hex>`          (per-block override)
 *
 * A dedicated name (not `--accent`) is used on purpose so it never shadows the
 * shadcn/Tailwind `--accent` design-system token used by hover states.
 */

export const accentColorField: Field<string> = {
  type: 'text',
  label: 'Accent Color',
}

/** Treat a value as "set" only when it's a non-empty trimmed string. */
function hasColor(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Inline style that scopes a block-local `--block-accent` variable.
 * Falls back to the tenant brand color (`--primary`) when no override is set.
 */
export function accentVars(accentColor?: string | null): CSSProperties {
  return {
    // Cast: `--block-accent` is a custom property, not in the CSSProperties type.
    ['--block-accent' as string]: hasColor(accentColor) ? accentColor.trim() : 'var(--primary)',
  }
}
