/**
 * Page validation shared by the web save path, the chat route and MCP (design §6, critique C1/C2).
 *
 * `validatePage` is LENIENT on purpose: existing pages carry legacy props, excluded layout
 * blocks and DropZone children, so it checks structure, unique ids, size caps, known types,
 * URL schemes and (optionally) tenant-id refs — and ignores unknown props. The STRICT check
 * for AI input is `catalog.validateBlock` (catalog.ts).
 */
import { normalizeRefIds } from './ids'
import { allItems, parseZone, findNode } from './tree'
import type { AiFieldRef, PageData } from './types'

// ── Limits (design §6 "Abuse caps") ────────────────────────────────────────────────────

export const PAGE_LIMITS = {
  maxTopLevelBlocks: 40,
  maxBlockPropsBytes: 32 * 1024,
  maxPageBytes: 512 * 1024,
  maxOpsPerTurn: 150,
  maxNestingDepth: 8,
} as const

/** UTF-8 byte length of a value's JSON. */
export function jsonBytes(value: unknown): number {
  const s = JSON.stringify(value) ?? ''
  return new TextEncoder().encode(s).length
}

// ── URLs and colours ───────────────────────────────────────────────────────────────────

export type UrlKind = 'href' | 'image'

const IMAGE_KEYS = new Set(['src', 'logo', 'avatar', 'image', 'imageurl', 'backgroundimage', 'ogimage', 'poster', 'thumbnail'])

/** Is this prop key a link (`href`, `ctaHref`, `url`…) or an image source? */
export function urlKindForKey(key: string): UrlKind | null {
  const k = key.toLowerCase()
  if (IMAGE_KEYS.has(k) || k.endsWith('imageurl') || k.endsWith('image')) return 'image'
  if (k === 'url' || k === 'link' || k.endsWith('href') || k.endsWith('url')) return 'href'
  return null
}

const SAFE_HREF_SCHEMES = new Set(['https:', 'mailto:', 'tel:'])

function schemeOf(value: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(value)
  return m ? m[1].toLowerCase() + ':' : null
}

/**
 * A link may be empty, `/`-relative (not `//`), `#anchor`, `https:`, `mailto:` or `tel:`.
 * Same rule as the render-side `safeHref` (lib/puck/utils/safe-href.ts): what saves, renders.
 */
export function isSafeHref(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  // Browsers strip tabs/newlines and leading control chars before parsing a URL.
  const v = value.replace(/[\u0000- \u007f]/g, '')
  if (v === '') return true
  if (v.startsWith('//') || v.startsWith('/\\') || v.startsWith('\\')) return false
  if (v.startsWith('/') || v.startsWith('#')) return true
  const scheme = schemeOf(v)
  return scheme !== null && SAFE_HREF_SCHEMES.has(scheme)
}

/** An image may be empty, `https:` (tenant storage included) or a `/`-relative asset. */
export function isSafeImageUrl(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  const v = value.replace(/[\u0000- \u007f]/g, '')
  if (v === '') return true
  if (v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\')) return true
  return schemeOf(v) === 'https:'
}

/** Colour overrides are hex only (`#rgb`, `#rrggbb`) or empty (= school theme). */
export function isSafeColor(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
}

export function isColorKey(key: string): boolean {
  return /color$/i.test(key)
}

/**
 * Walk a props object and report every URL that breaks the scheme rules, by key name at any
 * depth (`items[2].ctaHref`). Returns `[path, value, kind]` triples.
 */
export function findUnsafeUrls(props: unknown, maxDepth: number = PAGE_LIMITS.maxNestingDepth): Array<[string, string, UrlKind]> {
  const out: Array<[string, string, UrlKind]> = []
  const walk = (v: unknown, path: string, depth: number) => {
    if (depth > maxDepth || v === null || typeof v !== 'object') return
    if (Array.isArray(v)) {
      v.forEach((child, i) => walk(child, `${path}[${i}]`, depth + 1))
      return
    }
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k
      const kind = urlKindForKey(k)
      if (kind && typeof child === 'string') {
        const ok = kind === 'href' ? isSafeHref(child) : isSafeImageUrl(child)
        if (!ok) out.push([p, child, kind])
      } else if (kind && child !== null && child !== undefined && typeof child !== 'string' && typeof child !== 'object') {
        out.push([p, String(child), kind])
      } else {
        walk(child, p, depth + 1)
      }
    }
  }
  walk(props, '', 0)
  return out
}

// ── Tenant-id refs ─────────────────────────────────────────────────────────────────────

/** This tenant's ids per ref kind. A kind left undefined is not checked. */
export interface RefIdSets {
  course?: Iterable<string | number>
  product?: Iterable<string | number>
  plan?: Iterable<string | number>
}

export type RefKind = 'course' | 'product' | 'plan'

export function refKindOf(ref: AiFieldRef): RefKind {
  return ref.replace(/List$/, '') as RefKind
}

export function isListRef(ref: AiFieldRef): boolean {
  return ref.endsWith('List')
}

function asSet(ids: Iterable<string | number>): Set<string> {
  return new Set(normalizeRefIds(Array.from(ids)))
}

/** Ids in `value` (any accepted shape) that are not in this tenant's set for `ref`. */
export function unknownRefIds(value: unknown, ref: AiFieldRef, refs: RefIdSets | undefined): string[] {
  const allowed = refs?.[refKindOf(ref)]
  if (!allowed) return []
  const set = asSet(allowed)
  return normalizeRefIds(value).filter((id) => !set.has(id))
}

// ── validatePage (lenient) ─────────────────────────────────────────────────────────────

/** What validatePage needs from the catalog. */
export interface PageValidationCatalog {
  knows(type: string): boolean
  refFields(type: string): Array<{ key: string; ref: AiFieldRef }>
}

export interface PageValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface ValidatePageOptions {
  refs?: RefIdSets
  limits?: Partial<typeof PAGE_LIMITS>
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Lenient whole-page validation (critique C2). Errors block a save; warnings do not.
 * Checks: shape of root/content/zones, every item has a string `type` and `props.id`, ids
 * are unique, types are known, size caps, URL schemes, and ref ids when `refs` is given.
 * Unknown props are ignored.
 */
export function validatePage(data: unknown, catalog: PageValidationCatalog, opts: ValidatePageOptions = {}): PageValidation {
  const limits = { ...PAGE_LIMITS, ...opts.limits }
  const errors: string[] = []
  const warnings: string[] = []

  if (!isPlainObject(data)) return { ok: false, errors: ['page: not an object'], warnings }
  if (!Array.isArray(data.content)) errors.push('page: content must be an array')
  if (data.root !== undefined && !isPlainObject(data.root)) errors.push('page: root must be an object')
  if (isPlainObject(data.root) && data.root.props !== undefined && !isPlainObject(data.root.props)) {
    errors.push('page: root.props must be an object')
  }
  if (data.zones !== undefined && !isPlainObject(data.zones)) errors.push('page: zones must be an object')
  if (isPlainObject(data.zones)) {
    for (const [k, v] of Object.entries(data.zones)) {
      if (!Array.isArray(v)) errors.push(`zones["${k}"]: must be an array`)
      else if (!parseZone(k)) errors.push(`zones["${k}"]: malformed zone key`)
    }
  }
  if (errors.length) return { ok: false, errors, warnings }

  const page = data as unknown as PageData
  const bytes = jsonBytes(page)
  if (bytes > limits.maxPageBytes) errors.push(`page: ${bytes} bytes exceeds ${limits.maxPageBytes}`)
  if (page.content.length > limits.maxTopLevelBlocks) {
    errors.push(`page: ${page.content.length} top-level blocks exceeds ${limits.maxTopLevelBlocks}`)
  }

  const seen = new Set<string>()
  for (const { zone, index, item } of allItems(page)) {
    const where = `${zone}[${index}]`
    if (!isPlainObject(item) || typeof item.type !== 'string' || !item.type) {
      errors.push(`${where}: block needs a string type`)
      continue
    }
    if (!isPlainObject(item.props) || typeof item.props.id !== 'string' || !item.props.id) {
      errors.push(`${where} (${item.type}): block needs props.id`)
      continue
    }
    const id = item.props.id
    const label = `${where} (${item.type} "${id}")`
    if (seen.has(id)) errors.push(`${label}: duplicate id`)
    seen.add(id)
    if (!catalog.knows(item.type)) {
      errors.push(`${label}: unknown block type`)
      continue
    }
    const propBytes = jsonBytes(item.props)
    if (propBytes > limits.maxBlockPropsBytes) {
      errors.push(`${label}: props are ${propBytes} bytes, over ${limits.maxBlockPropsBytes}`)
    }
    for (const [path, value, kind] of findUnsafeUrls(item.props, limits.maxNestingDepth)) {
      errors.push(`${label}.${path}: unsafe ${kind === 'href' ? 'link' : 'image URL'} "${value.slice(0, 80)}"`)
    }
    for (const { key, ref } of catalog.refFields(item.type)) {
      const bad = unknownRefIds(item.props[key], ref, opts.refs)
      if (bad.length) errors.push(`${label}.${key}: not this school's ${refKindOf(ref)} id(s): ${bad.join(', ')}`)
    }
  }

  for (const zone of Object.keys(page.zones ?? {})) {
    const parent = parseZone(zone)?.parentId
    if (parent && !findNode(page, parent)) warnings.push(`zones["${zone}"]: parent block "${parent}" not on the page`)
  }

  return { ok: errors.length === 0, errors, warnings }
}
