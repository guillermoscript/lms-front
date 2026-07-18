/**
 * json-render catalog for the landing-page builder — derived from the Puck config.
 *
 * This is the AI-facing *vocabulary*: which landing-page blocks an LLM may use, with typed
 * props and descriptions that guide generation. Rather than hand-maintaining a parallel
 * definition, every component's props schema is generated from its Puck `fields` via
 * `puckFieldsToZod` (see ADR 0001). So `lib/puck/config.ts` is the single source of truth for
 * BOTH the human editor and the AI generator — they cannot drift.
 *
 * The only thing not derivable from Puck is the AI guidance text, so we keep a description
 * map here. Components without a description are still included (with a generic note) unless
 * listed in EXCLUDED — pure structural/primitive blocks that an LLM should not emit as
 * top-level page sections (they're for humans composing layouts in Puck).
 */
import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { puckFieldsToZod } from './from-puck-fields'
// Hand-maintained AI metadata (excluded blocks + per-block descriptions). Lives in its own
// pure-data module so the manifest codegen script can mirror it into the standalone
// mcp-server package. See catalog-meta.ts.
import { COMPONENT_DESCRIPTIONS, EXCLUDED_COMPONENTS } from './catalog-meta'
// Pure-data field manifest generated from lib/puck/config.ts (the single source of truth).
// Imported instead of puckConfig so this catalog never bundles the client Puck editor tree
// (DropZone etc.) into server contexts like the /api/landing/generate route.
// Regenerate with: npx tsx scripts/gen-puck-fields-manifest.ts
import manifest from './puck-fields.generated.json'

const EXCLUDED = new Set<string>(EXCLUDED_COMPONENTS)
const DESCRIPTIONS = COMPONENT_DESCRIPTIONS

// Build the catalog components map from the Puck config.
const components: Record<
  string,
  { description: string; props: ReturnType<typeof puckFieldsToZod> }
> = {}

for (const [name, entry] of Object.entries(manifest)) {
  if (EXCLUDED.has(name)) continue
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields = (entry as any).fields as Record<string, any> | undefined
  components[name] = {
    description: DESCRIPTIONS[name] ?? `The ${name} landing-page block.`,
    props: puckFieldsToZod(fields),
  }
}

export const landingCatalog = defineCatalog(schema, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: components as any,
  actions: {},
})

export type LandingCatalog = typeof landingCatalog

/** Names the AI may generate (everything in the catalog). Useful for tests/UI hints. */
export const CATALOG_COMPONENT_NAMES = Object.keys(components)

/**
 * Each component's Puck `defaultProps`, keyed by component name. The bridge merges these
 * UNDER the AI-supplied props so a generated block always has its required arrays/values even
 * when the model omits them — Puck's `Render` does not reliably backfill defaults for
 * top-level props, so a missing array would otherwise crash a block at `items.length`.
 * Derived from the same manifest as the catalog, so it stays in sync with lib/puck/config.ts.
 */
export const DEFAULT_PROPS_BY_TYPE: Record<string, Record<string, unknown>> = {}
for (const [name, entry] of Object.entries(manifest)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DEFAULT_PROPS_BY_TYPE[name] = ((entry as any).defaultProps ?? {}) as Record<string, unknown>
}
