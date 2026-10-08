/**
 * Array defaults (design §3.2 "Merge", skill invariant #6).
 *
 * `update.props` replaces arrays whole. Blocks map over array items and read their fields
 * (`features.split('\n')`, nested `links.map`), so every item an op writes is filled with
 * neutral defaults for the fields it omits: `''` for text, `[]` for nested arrays, the first
 * option for a select/radio, and a non-text `defaultItemProps` value (e.g. `rating: 5`) when
 * the block declares one. Placeholder TEXT from `defaultItemProps` ("Feature", "Team
 * Member") is deliberately not copied: an empty field beats an invented one.
 */
import type { ManifestField } from './types'

function neutralDefault(field: ManifestField): unknown {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return ''
    case 'array':
      return []
    case 'select':
    case 'radio':
      return field.options?.[0]?.value
    default:
      return undefined
  }
}

function fillItem(item: unknown, field: ManifestField): unknown {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item
  const sub = field.arrayFields ?? {}
  const out: Record<string, unknown> = { ...(item as Record<string, unknown>) }
  for (const [key, subField] of Object.entries(sub)) {
    if (out[key] === undefined || out[key] === null) {
      const declared = field.defaultItemProps?.[key]
      const value =
        declared !== undefined && typeof declared !== 'string' ? structuredCloneSafe(declared) : neutralDefault(subField)
      if (value !== undefined) out[key] = value
    } else if (subField.type === 'array' && Array.isArray(out[key])) {
      out[key] = (out[key] as unknown[]).map((child) => fillItem(child, subField))
    }
  }
  return out
}

function structuredCloneSafe<T>(v: T): T {
  return v === null || typeof v !== 'object' ? v : (JSON.parse(JSON.stringify(v)) as T)
}

/**
 * Fill the items of every array prop present in `props` (only the keys in `props` are
 * touched). Returns a new object; `props` is not mutated.
 */
export function applyArrayDefaults(
  props: Record<string, unknown>,
  fields: Record<string, ManifestField> | undefined
): Record<string, unknown> {
  if (!fields) return props
  let out = props
  for (const [key, field] of Object.entries(fields)) {
    if (field.type !== 'array' || !Array.isArray(props[key])) continue
    if (out === props) out = { ...props }
    out[key] = (props[key] as unknown[]).map((item) => fillItem(item, field))
  }
  return out
}

/** A blank item for an array field (what a client "add item" or a streaming skeleton uses). */
export function arrayItemSkeleton(field: ManifestField): Record<string, unknown> {
  return fillItem({}, field) as Record<string, unknown>
}
