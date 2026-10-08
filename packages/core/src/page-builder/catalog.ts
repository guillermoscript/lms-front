/**
 * How the AI sees blocks (design §3.4, critique C2/E5).
 *
 * `createCatalog(manifest)` builds, from the generated manifest (Puck fields + defaultProps +
 * folded ai-annotations):
 *   - a STRICT per-type zod props schema for AI input (`validateBlock`): unknown or excluded
 *     types, unknown props, wrong enums, unsafe URLs/colours and foreign ids are rejected;
 *   - a compact prompt doc (labels, enums, instructions) with the shared section fields
 *     described ONCE;
 *   - a JSON-schema subset for providers that want one.
 * `pageCatalog` is the instance over the committed generated manifest.
 */
import { z } from 'zod'
import { normalizeId } from './ids'
import type { OpsCatalog } from './apply-ops'
import { zoneNameMatches } from './tree'
import {
  PAGE_LIMITS,
  findUnsafeUrls,
  isColorKey,
  isListRef,
  isSafeColor,
  jsonBytes,
  refKindOf,
  unknownRefIds,
  urlKindForKey,
  validatePage,
  type PageValidation,
  type PageValidationCatalog,
  type RefIdSets,
  type ValidatePageOptions,
} from './validate'
import type {
  AiFieldRef,
  ManifestAiField,
  ManifestEntry,
  ManifestField,
  ManifestOptionValue,
  PageBuilderManifest,
} from './types'
import { PAGE_BUILDER_MANIFEST } from './generated/manifest.generated'

export interface BlockValidation {
  ok: boolean
  /** Normalised props (nulls dropped, `id` stripped, numeric/boolean strings coerced, refs as strings). */
  props: Record<string, unknown>
  errors: string[]
}

export interface ValidateBlockOptions {
  /** This tenant's ids; a kind left undefined is not checked. */
  refs?: RefIdSets
  /**
   * `add` (default): the type must be AI-allowed and `ai.required` fields must be set.
   * `update`: a partial patch; an excluded (layout/primitive) block already on the page may
   * still be edited.
   */
  mode?: 'add' | 'update'
}

export interface RefField {
  key: string
  ref: AiFieldRef
}

export interface PageCatalog extends OpsCatalog, PageValidationCatalog {
  readonly manifest: PageBuilderManifest
  /** Every block type the editor knows (excluded ones included). */
  readonly types: string[]
  /** Block types the AI may add. */
  readonly allowedTypes: string[]
  /** Field keys described once as shared section fields. */
  readonly sharedFieldKeys: ReadonlySet<string>
  /** Is `type.key` the shared section-layer field (not a same-named field of the block's own)? */
  isSharedField(type: string, key: string): boolean
  isAllowed(type: string): boolean
  entry(type: string): ManifestEntry | undefined
  /** Strict zod schema for a block's AI props (all optional). */
  propsSchema(type: string): z.ZodType | undefined
  validateBlock(type: string, props: unknown, opts?: ValidateBlockOptions): BlockValidation
  /** Top-level text/textarea fields that may stream token by token. */
  streamableFields(type: string): string[]
  /** Top-level keys holding a video link or iframe embed code (`ai.fields[key].urlKind: 'embed'`). */
  embedKeys(type: string): ReadonlySet<string>
  /** Lenient whole-page validation (see validate.ts). */
  validatePage(data: unknown, opts?: ValidatePageOptions): PageValidation
  /** The compact block doc for system prompts and MCP. */
  promptDoc(): string
  /** JSON schema of a block's props, for strict providers. */
  jsonSchema(type: string): Record<string, unknown> | undefined
  /** Page-level root fields (SEO) from the generated manifest. */
  rootFields(): Record<string, ManifestField>
  /**
   * Strict check for `updateRoot` props from the AI/MCP: known root keys only, strings only,
   * safe image URL. Returns the props to apply.
   */
  validateRoot(props: unknown): BlockValidation
}

// ── zod from Puck fields ────────────────────────────────────────────────────────────────

const idValue = z.union([z.string(), z.number()])

function refSchema(ref: AiFieldRef): z.ZodType {
  if (!isListRef(ref)) return idValue
  return z.array(z.union([idValue, z.object({ id: idValue })]))
}

function optionValues(field: ManifestField): ManifestOptionValue[] {
  return (field.options ?? []).map((o) => o.value).filter((v) => v !== undefined && v !== null)
}

function fieldSchema(field: ManifestField, ai: ManifestAiField | undefined): z.ZodType {
  if (ai?.ref) return refSchema(ai.ref)
  switch (field.type) {
    case 'text':
    case 'textarea':
      return z.string()
    case 'number':
      return z.number()
    case 'select':
    case 'radio': {
      const values = optionValues(field)
      if (values.length === 0) return z.union([z.string(), z.number(), z.boolean()])
      if (values.every((v) => typeof v === 'string')) return z.enum(values as [string, ...string[]])
      return z.literal(values as [ManifestOptionValue, ...ManifestOptionValue[]])
    }
    case 'array': {
      const shape: Record<string, z.ZodType> = {}
      for (const [k, sub] of Object.entries(field.arrayFields ?? {})) shape[k] = fieldSchema(sub, undefined).optional()
      return z.array(z.strictObject(shape))
    }
    default:
      return z.unknown()
  }
}

function blockSchema(entry: ManifestEntry): z.ZodType {
  const shape: Record<string, z.ZodType> = {}
  for (const [key, field] of Object.entries(entry.fields)) {
    shape[key] = fieldSchema(field, entry.ai?.fields?.[key]).optional()
  }
  return z.strictObject(shape)
}

// ── Normalisation (lenient coercion before the strict parse) ─────────────────────────────

function coerceScalar(value: unknown, field: ManifestField): unknown {
  if (field.type === 'number' && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  if (field.type === 'select' || field.type === 'radio') {
    const values = optionValues(field)
    if (values.includes(value as ManifestOptionValue)) return value
    const match = values.find((v) => String(v) === String(value))
    if (match !== undefined) return match
  }
  return value
}

function normalizeArrayItems(value: unknown, field: ManifestField): unknown {
  if (!Array.isArray(value)) return value
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (v === null || v === undefined) continue
      const sub = field.arrayFields?.[k]
      if (!sub) out[k] = v
      else if (sub.type === 'array') out[k] = normalizeArrayItems(v, sub)
      else out[k] = coerceScalar(v, sub)
    }
    return out
  })
}

/** Refs are stored as strings: single → `"12"`, list → `[{id:"12"}]` (the picker shape). */
function normalizeRef(value: unknown, ref: AiFieldRef): unknown {
  if (!isListRef(ref)) {
    if (value === '') return ''
    return normalizeId(value) ?? value
  }
  if (!Array.isArray(value)) return value
  return value.map((v) => {
    const id = normalizeId(v)
    return id === null ? v : { id }
  })
}

function normalizeProps(entry: ManifestEntry, props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key === 'id' || value === null || value === undefined) continue
    const field = entry.fields[key]
    const ref = entry.ai?.fields?.[key]?.ref
    if (!field) out[key] = value
    else if (ref) out[key] = normalizeRef(value, ref)
    else if (field.type === 'array') out[key] = normalizeArrayItems(value, field)
    else out[key] = coerceScalar(value, field)
  }
  return out
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('').replace(/^\./, '')
    if (issue.code === 'unrecognized_keys') {
      const where = path ? `${path}: ` : ''
      return `${where}unknown prop(s) ${(issue as { keys: string[] }).keys.join(', ')}`
    }
    return `${path || 'props'}: ${issue.message}`
  })
}

function findBadColors(props: Record<string, unknown>): string[] {
  const out: string[] = []
  const walk = (v: unknown, path: string) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) return v.forEach((c, i) => walk(c, `${path}[${i}]`))
    for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k
      if (isColorKey(k) && (typeof c === 'string' || typeof c === 'number')) {
        if (!isSafeColor(c)) out.push(`${p}: colour must be a #hex value or empty, got "${String(c)}"`)
      } else walk(c, p)
    }
  }
  walk(props, '')
  return out
}

// ── Prompt doc ─────────────────────────────────────────────────────────────────────────

const LABEL_SYNONYMS: Record<string, string[]> = {
  href: ['url', 'link'],
  cta: ['button', 'call', 'action'],
  src: ['source'],
  y: ['vertical'],
  x: ['horizontal'],
  max: ['maximum'],
  min: ['minimum'],
  count: ['number'],
  bg: ['background'],
}
// Kind words ("URL", "Text", "Field"…) say nothing the type marker does not.
const LABEL_STOPWORDS = new Set([
  'of', 'the', 'a', 'an', 'to', 'for', 'per', 'or', 'and', 'show', 'enable',
  'url', 'text', 'field', 'button', 'label', 'image', 'link', 'color', 'section', 'number',
  'fallback', 'background', 'contact', 'pull', 'max', 'pinned', 'curated',
])

function words(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
}

/** A field's label is printed only when it adds words the key does not already carry. */
function labelHint(key: string, label: string | undefined): string {
  if (!label) return ''
  const known = new Set<string>()
  for (const w of words(key)) {
    known.add(w)
    for (const syn of LABEL_SYNONYMS[w] ?? []) known.add(syn)
  }
  const adds = words(label).some((w) => !known.has(w) && !LABEL_STOPWORDS.has(w))
  return adds ? ` "${label}"` : ''
}

function describeType(key: string, field: ManifestField, ai: ManifestAiField | undefined): string {
  if (ai?.ref) return isListRef(ai.ref) ? ` ${refKindOf(ai.ref)} ids` : ` ${refKindOf(ai.ref)} id`
  if (field.type === 'number') return ' #'
  if (field.type === 'select' || field.type === 'radio') {
    const values = optionValues(field)
    if (values.length === 2 && values.includes(true) && values.includes(false)) {
      // show*/use*/is*/has* read as booleans without a marker.
      return /^(show|use|is|has)[A-Z]/.test(key) ? '' : ' bool'
    }
    const shown = values.length > 6 ? [...values.slice(0, 2), '…', values[values.length - 1]] : values
    return shown.length ? ` ${shown.map(String).join('|')}` : ''
  }
  return ''
}

function describeField(
  key: string,
  field: ManifestField,
  ai: ManifestAiField | undefined,
  /** Annotation of an array sub-field, keyed `items.text` in the side-map. */
  subAi?: (subKey: string) => ManifestAiField | undefined
): string {
  if (field.type === 'array') {
    const subs = Object.entries(field.arrayFields ?? {}).map(([k, sub]) => {
      if (sub.type === 'array') return `${k}[]`
      const a = subAi?.(k)
      return `${k}${describeType(k, sub, a)}${a?.instructions ? ` (${a.instructions})` : ''}`
    })
    return `${key}[]{${subs.join(',')}}${ai?.instructions ? ` (${ai.instructions})` : ''}`
  }
  const required = ai?.required ? '*' : ''
  // Instructions, when present, say more than the label.
  const hint = ai?.instructions ? ` (${ai.instructions})` : labelHint(key, field.label)
  return `${key}${required}${describeType(key, field, ai)}${hint}`
}

/**
 * The canonical definition of each shared field: the one most allowed blocks spread in from
 * the section layer. A block whose same-named field differs (TextBlock's px `maxWidth`,
 * ShinyEyebrow's left|center|right `align`) owns that field and describes it itself.
 */
function canonicalSharedDefs(manifest: PageBuilderManifest, allowed: string[], shared: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>()
  for (const key of shared) {
    const counts = new Map<string, number>()
    for (const t of allowed) {
      const f = manifest.components[t]?.fields[key]
      if (!f) continue
      const sig = JSON.stringify(f)
      counts.set(sig, (counts.get(sig) ?? 0) + 1)
    }
    let best: string | undefined
    let bestN = 0
    for (const [sig, n] of counts) if (n > bestN) [best, bestN] = [sig, n]
    if (best !== undefined) out.set(key, best)
  }
  return out
}

/** Shared slug rule for `anchorId` (mirrors lib/puck/utils/section-style.ts ANCHOR_ID_PATTERN). */
export const ANCHOR_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
export const ANCHOR_ID_MAX = 64

function buildPromptDoc(
  manifest: PageBuilderManifest,
  allowed: string[],
  shared: ReadonlySet<string>,
  isShared: (type: string, key: string) => boolean
): string {
  const lines: string[] = []
  lines.push(
    'BLOCKS (Type: use. props). a|b = values, # = number, show*/use* = true|false, x[]{..} = item list, * = set it. Links: /path, #anchor, https:, mailto:, tel:. Images: https. Ids only from the business context. Most blocks also take *Color props (#hex): leave them empty (school theme) unless asked.'
  )
  // Shared fields, once.
  const sharedDescs: string[] = []
  for (const key of shared) {
    const ownerType = allowed.find((t) => manifest.components[t]?.fields[key] && isShared(t, key))
    if (!ownerType) continue
    const owner = manifest.components[ownerType]
    sharedDescs.push(describeField(key, owner.fields[key], manifest.shared.fields?.[key]))
  }
  if (sharedDescs.length) {
    lines.push(`Shared fields (blocks marked +s): ${manifest.shared.instructions} ${sharedDescs.join('; ')}`)
  }
  for (const type of allowed) {
    const entry = manifest.components[type]
    const own: string[] = []
    let hasShared = false
    for (const [key, field] of Object.entries(entry.fields)) {
      if (isShared(type, key)) {
        hasShared = true
        continue
      }
      // Colour overrides are described once in the header.
      if (isColorKey(key) && !entry.ai?.fields?.[key]?.instructions) continue
      own.push(describeField(key, field, entry.ai?.fields?.[key], (k) => entry.ai?.fields?.[`${key}.${k}`]))
    }
    const instr = entry.ai?.instructions?.trim() || `The ${type} block.`
    lines.push(`${type}: ${instr} ${own.join(', ')}${hasShared ? ' +s' : ''}`.trimEnd())
  }
  return lines.join('\n')
}

// ── createCatalog ──────────────────────────────────────────────────────────────────────

export function createCatalog(manifest: PageBuilderManifest): PageCatalog {
  const types = Object.keys(manifest.components)
  const allowedTypes = types.filter((t) => !manifest.components[t].ai?.exclude)
  const allowedSet = new Set(allowedTypes)
  const sharedFieldKeys: ReadonlySet<string> = new Set(Object.keys(manifest.shared.fields ?? {}))
  const schemaCache = new Map<string, z.ZodType>()
  let docCache: string | null = null
  const sharedDefs = canonicalSharedDefs(manifest, allowedTypes, sharedFieldKeys)
  const isShared = (type: string, key: string): boolean => {
    const f = Object.prototype.hasOwnProperty.call(manifest.components, type) ? manifest.components[type].fields[key] : undefined
    return !!f && sharedDefs.get(key) === JSON.stringify(f)
  }

  const entry = (type: string) => (Object.prototype.hasOwnProperty.call(manifest.components, type) ? manifest.components[type] : undefined)

  const propsSchema = (type: string) => {
    const e = entry(type)
    if (!e) return undefined
    let s = schemaCache.get(type)
    if (!s) {
      s = blockSchema(e)
      schemaCache.set(type, s)
    }
    return s
  }

  const refFields = (type: string): RefField[] =>
    Object.entries(entry(type)?.ai?.fields ?? {})
      .filter(([key, a]) => a.ref && !key.includes('.'))
      .map(([key, a]) => ({ key, ref: a.ref! }))

  const embedCache = new Map<string, ReadonlySet<string>>()
  const embedKeys = (type: string): ReadonlySet<string> => {
    let keys = embedCache.get(type)
    if (!keys) {
      keys = new Set(
        Object.entries(entry(type)?.ai?.fields ?? {})
          .filter(([key, a]) => a.urlKind === 'embed' && !key.includes('.'))
          .map(([key]) => key)
      )
      embedCache.set(type, keys)
    }
    return keys
  }

  const catalog: PageCatalog = {
    manifest,
    types,
    allowedTypes,
    sharedFieldKeys,
    isSharedField: isShared,
    has: (type) => !!entry(type),
    knows: (type) => !!entry(type),
    isAllowed: (type) => allowedSet.has(type),
    entry,
    defaultProps: (type) => entry(type)?.defaultProps ?? {},
    fields: (type) => entry(type)?.fields,
    refFields,
    embedKeys,
    acceptsZone: (type, zoneName) => zoneNameMatches(entry(type)?.ai?.zones, zoneName),
    propsSchema,

    validateBlock(type, props, opts = {}) {
      const e = entry(type)
      if (!e) {
        return { ok: false, props: {}, errors: [`unknown block type "${type}". Valid: ${allowedTypes.join(', ')}`] }
      }
      const mode = opts.mode ?? 'add'
      if (mode === 'add' && !allowedSet.has(type)) {
        return { ok: false, props: {}, errors: [`"${type}" is a layout block for the human editor; use a section block`] }
      }
      if (!props || typeof props !== 'object' || Array.isArray(props)) {
        return { ok: false, props: {}, errors: ['props must be an object'] }
      }
      const normalized = normalizeProps(e, props as Record<string, unknown>)
      const errors: string[] = []
      const parsed = propsSchema(type)!.safeParse(normalized)
      if (!parsed.success) errors.push(...formatIssues(parsed.error))
      for (const [path, value, kind] of findUnsafeUrls(normalized, { embedKeys: embedKeys(type) })) {
        const hint =
          kind === 'href'
            ? 'link (use /path, #anchor, https:, mailto: or tel:)'
            : kind === 'image'
              ? 'image URL (use https:)'
              : 'video (use an https video link or an <iframe> embed code with an https src)'
        errors.push(`${path}: unsafe ${hint} "${value.slice(0, 80)}"`)
      }
      errors.push(...findBadColors(normalized))
      const anchor = normalized.anchorId
      if (isShared(type, 'anchorId') && typeof anchor === 'string' && anchor !== '' &&
          (anchor.length > ANCHOR_ID_MAX || !ANCHOR_ID_PATTERN.test(anchor))) {
        errors.push(`anchorId: "${anchor.slice(0, 80)}" must be a lowercase slug (a-z, 0-9, dashes), e.g. "about"`)
      }
      for (const { key, ref } of refFields(type)) {
        const bad = unknownRefIds(normalized[key], ref, opts.refs)
        if (bad.length) errors.push(`${key}: ${bad.join(', ')} is not one of this school's ${refKindOf(ref)} ids`)
      }
      if (mode === 'add') {
        for (const [key, a] of Object.entries(e.ai?.fields ?? {})) {
          if (a.required && !key.includes('.') && (normalized[key] === undefined || normalized[key] === '')) {
            errors.push(`${key}: required`)
          }
        }
      }
      const bytes = jsonBytes(normalized)
      if (bytes > PAGE_LIMITS.maxBlockPropsBytes) errors.push(`props: ${bytes} bytes, over ${PAGE_LIMITS.maxBlockPropsBytes}`)
      return { ok: errors.length === 0, props: normalized, errors }
    },

    streamableFields(type) {
      const e = entry(type)
      if (!e) return []
      return Object.entries(e.fields)
        .filter(([key, f]) => {
          if (f.type !== 'text' && f.type !== 'textarea') return false
          const a = e.ai?.fields?.[key]
          if (a?.stream === false || a?.ref) return false
          return !urlKindForKey(key) && !isColorKey(key) && !isShared(type, key)
        })
        .map(([key]) => key)
    },

    validatePage(data, opts) {
      return validatePage(data, catalog, opts)
    },

    promptDoc() {
      if (docCache === null) docCache = buildPromptDoc(manifest, allowedTypes, sharedFieldKeys, isShared)
      return docCache
    },

    rootFields: () => manifest.root?.fields ?? {},

    validateRoot(props) {
      if (!props || typeof props !== 'object' || Array.isArray(props)) {
        return { ok: false, props: {}, errors: ['props must be an object'] }
      }
      const fields = manifest.root?.fields ?? {}
      const out: Record<string, unknown> = {}
      const errors: string[] = []
      for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) {
          errors.push(`${key}: not a page setting. Valid: ${Object.keys(fields).join(', ')}`)
          continue
        }
        if (typeof value !== 'string') {
          errors.push(`${key}: must be a string`)
          continue
        }
        out[key] = value
      }
      for (const [path, value, kind] of findUnsafeUrls(out)) {
        errors.push(`${path}: unsafe ${kind === 'href' ? 'link' : 'image URL (use https:)'} "${value.slice(0, 80)}"`)
      }
      return { ok: errors.length === 0, props: out, errors }
    },

    jsonSchema(type) {
      const s = propsSchema(type)
      if (!s) return undefined
      return z.toJSONSchema(s, { unrepresentable: 'any' }) as Record<string, unknown>
    },
  }
  return catalog
}

/**
 * The catalog over the committed generated manifest. Marked pure (and the package is
 * `sideEffects: false`) so client bundles that import other `@lms/core` exports drop the
 * page-builder modules and their generated data.
 */
export const pageCatalog: PageCatalog = /* @__PURE__ */ createCatalog(PAGE_BUILDER_MANIFEST)
