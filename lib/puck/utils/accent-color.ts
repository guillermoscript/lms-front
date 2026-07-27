import type { Field } from '@measured/puck'
import type { CSSProperties } from 'react'

import { readableOn } from '@/lib/color/contrast'

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
 * Inline style that scopes a block-local `--block-accent` variable, paired with
 * the `--block-accent-foreground` that reads on top of it.
 *
 * Falls back to the tenant brand color (`--primary`) when no override is set.
 *
 * The foreground half exists because blocks used to hardcode
 * `text-primary-foreground` (a near-white) over whatever colour an admin typed
 * into the "Accent Color" field, so a pale accent rendered white-on-white
 * (issue #569). It is computed from the accent's luminance, and for the brand
 * fallback it defers to `--primary-foreground`, which
 * `components/tenant/tenant-css-vars-server.tsx` derives from the tenant's
 * primary colour for exactly the same reason.
 *
 * A colour we cannot parse (an unknown keyword, a `var()`) keeps the old
 * near-white rather than guessing at something possibly worse.
 */
export function accentVars(accentColor?: string | null): CSSProperties {
  const explicit = hasColor(accentColor) ? accentColor.trim() : null
  return {
    // Cast: these are custom properties, not in the CSSProperties type.
    ['--block-accent' as string]: explicit ?? 'var(--primary)',
    ['--block-accent-foreground' as string]: explicit
      ? readableOn(explicit, 'var(--primary-foreground)')
      : 'var(--primary-foreground)',
  }
}
