/**
 * Generates lib/json-render/puck-fields.generated.json — a pure-data manifest of every Puck
 * component's `fields`, keyed by component name, plus its category.
 *
 * Why: the json-render catalog must derive its prop schemas from the Puck components' fields,
 * but it runs in a SERVER context (the /api/landing/generate route). Importing `lib/puck/config.ts`
 * there would bundle the entire client Puck editor tree (DropZone, etc.) into the server build
 * and fail. This manifest is plain JSON with no React imports, so the catalog can import it
 * anywhere safely — while `lib/puck/config.ts` stays the single source of truth.
 *
 * Run: npx tsx scripts/gen-puck-fields-manifest.ts
 * Re-run whenever a component's fields change (add to a precommit/CI step).
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { puckConfig } from '../lib/puck/config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFields = Record<string, any>

interface ManifestEntry {
  category: string | null
  fields: AnyFields
}

// Reverse-map component name → category from the config's categories.
const categoryOf: Record<string, string> = {}
for (const [cat, def] of Object.entries(puckConfig.categories ?? {})) {
  for (const name of (def as { components?: string[] }).components ?? []) {
    categoryOf[name] = cat
  }
}

const manifest: Record<string, ManifestEntry> = {}
for (const [name, def] of Object.entries(puckConfig.components)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields = ((def as any).fields ?? {}) as AnyFields
  // Strip non-serializable bits (functions like custom field renderers) — keep only the
  // declarative shape the catalog needs: type, label, options, arrayFields.
  manifest[name] = {
    category: categoryOf[name] ?? null,
    fields: pruneFields(fields),
  }
}

function pruneFields(fields: AnyFields): AnyFields {
  const out: AnyFields = {}
  for (const [k, f] of Object.entries(fields)) {
    if (!f || typeof f !== 'object') continue
    const entry: AnyFields = { type: f.type }
    if (typeof f.label === 'string') entry.label = f.label
    if (Array.isArray(f.options)) {
      entry.options = f.options
        .filter((o: unknown) => o && typeof o === 'object')
        .map((o: { label?: unknown; value?: unknown }) => ({ label: o.label, value: o.value }))
    }
    if (f.arrayFields && typeof f.arrayFields === 'object') {
      entry.arrayFields = pruneFields(f.arrayFields)
    }
    out[k] = entry
  }
  return out
}

const target = resolve(__dirname, '../lib/json-render/puck-fields.generated.json')
writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Wrote ${Object.keys(manifest).length} components → ${target}`)
