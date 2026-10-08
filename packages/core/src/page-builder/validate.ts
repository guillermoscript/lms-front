/**
 * Page validation shared by the web save path, the chat route and MCP (design §6, critique C1/C2).
 *
 * `validatePage` is LENIENT on purpose: existing pages carry legacy props, excluded layout
 * blocks and DropZone children, so it checks structure, unique ids, size caps, known types,
 * dangerous URL schemes (`javascript:`, `data:` links, `//host`; `http:` passes) and
 * (optionally) tenant-id refs — and ignores unknown props. The STRICT check
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

/** `embed` = a video link or a pasted `<iframe>` snippet (manifest `ai.fields[key].urlKind`). */
export type UrlKind = 'href' | 'image' | 'embed'

const IMAGE_KEYS = new Set(['src', 'logo', 'avatar', 'image', 'imageurl', 'backgroundimage', 'ogimage', 'poster', 'thumbnail'])

/** Is this prop key a link (`href`, `ctaHref`, `url`…) or an image source? */
export function urlKindForKey(key: string): 'href' | 'image' | null {
  const k = key.toLowerCase()
  if (IMAGE_KEYS.has(k) || k.endsWith('imageurl') || k.endsWith('image')) return 'image'
  if (k === 'url' || k === 'link' || k.endsWith('href') || k.endsWith('url')) return 'href'
  return null
}

const SAFE_HREF_SCHEMES = new Set(['https:', 'mailto:', 'tel:'])
/** Schemes no saved value may carry, even on the lenient path. */
const DANGEROUS_SCHEMES = new Set(['javascript:', 'vbscript:', 'data:', 'file:', 'blob:'])

function schemeOf(value: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(value)
  return m ? m[1].toLowerCase() + ':' : null
}

/** Browsers strip tabs/newlines and leading control chars before parsing a URL. */
const compact = (value: string) => value.replace(/[\u0000- \u007f]/g, '')

const isProtocolRelative = (v: string) => v.startsWith('//') || v.startsWith('/\\') || v.startsWith('\\')

/**
 * A link may be empty, `/`-relative (not `//`), `#anchor`, `https:`, `mailto:` or `tel:`.
 * Same rule as the render-side `safeHref` (lib/puck/utils/safe-href.ts): what saves, renders.
 */
export function isSafeHref(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  const v = compact(value)
  if (v === '') return true
  if (isProtocolRelative(v)) return false
  if (v.startsWith('/') || v.startsWith('#')) return true
  const scheme = schemeOf(v)
  return scheme !== null && SAFE_HREF_SCHEMES.has(scheme)
}

/**
 * The lenient link rule for content already on a page (critique C2): only values that can do
 * harm fail (`javascript:`, `data:`… and `//host`). `http:` and bare domains pass; the
 * render-side `safeHref` upgrades or neutralises them.
 */
export function isTolerableHref(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  const v = compact(value)
  if (isProtocolRelative(v)) return false
  const scheme = schemeOf(v)
  return scheme === null || !DANGEROUS_SCHEMES.has(scheme)
}

/** An image may be empty, `https:` (tenant storage included) or a `/`-relative asset. */
export function isSafeImageUrl(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  const v = compact(value)
  if (v === '') return true
  if (v.startsWith('/') && !isProtocolRelative(v)) return true
  return schemeOf(v) === 'https:'
}

/** The lenient image rule: also `http:` (local storage) and inline `data:image/…`. */
export function isTolerableImageUrl(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  const v = compact(value)
  if (isProtocolRelative(v)) return false
  if (/^data:image\//i.test(v)) return true
  const scheme = schemeOf(v)
  return scheme === null || !DANGEROUS_SCHEMES.has(scheme)
}

/** The `src` of a pasted `<iframe …>` snippet (mirrors lib/video/embed.ts), or null. */
export function iframeSnippetSrc(value: string): string | null {
  if (!/^\s*<iframe[\s>]/i.test(value)) return null
  const m = value.match(/<iframe[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i)
  return m ? m[1].trim().replace(/^\/\//, 'https://') : null
}

/**
 * A video field: empty, an `http(s):` link (the player resolves it to a provider's https
 * embed URL or shows nothing), or a pasted `<iframe>` snippet whose `src` is https. The
 * snippet's markup is never rendered: the player builds its own iframe from the `src`.
 */
export function isSafeEmbed(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string') return false
  const raw = value.trim()
  if (raw === '') return true
  if (raw.startsWith('<')) {
    const src = iframeSnippetSrc(raw)
    return src !== null && schemeOf(compact(src)) === 'https:'
  }
  const scheme = schemeOf(compact(raw))
  return scheme === 'https:' || scheme === 'http:'
}

/** Colour overrides are hex only (`#rgb`, `#rrggbb`) or empty (= school theme). */
export function isSafeColor(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
}

export function isColorKey(key: string): boolean {
  return /color$/i.test(key)
}

export interface UrlCheckOptions {
  maxDepth?: number
  /** The lenient rules for content already on a page (validatePage), else the strict AI rules. */
  lenient?: boolean
  /** Top-level keys holding a video link or iframe snippet (manifest `urlKind: 'embed'`). */
  embedKeys?: ReadonlySet<string>
}

function urlOk(kind: UrlKind, value: string, lenient: boolean): boolean {
  if (kind === 'embed') return isSafeEmbed(value)
  if (kind === 'href') return lenient ? isTolerableHref(value) : isSafeHref(value)
  return lenient ? isTolerableImageUrl(value) : isSafeImageUrl(value)
}

/**
 * Walk a props object and report every URL that breaks the scheme rules, by key name at any
 * depth (`items[2].ctaHref`). Returns `[path, value, kind]` triples.
 */
export function findUnsafeUrls(props: unknown, opts: UrlCheckOptions = {}): Array<[string, string, UrlKind]> {
  const maxDepth = opts.maxDepth ?? PAGE_LIMITS.maxNestingDepth
  const lenient = opts.lenient ?? false
  const out: Array<[string, string, UrlKind]> = []
  const walk = (v: unknown, path: string, depth: number) => {
    if (depth > maxDepth || v === null || typeof v !== 'object') return
    if (Array.isArray(v)) {
      v.forEach((child, i) => walk(child, `${path}[${i}]`, depth + 1))
      return
    }
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k
      const kind: UrlKind | null = depth === 0 && opts.embedKeys?.has(k) ? 'embed' : urlKindForKey(k)
      if (kind && typeof child === 'string') {
        if (!urlOk(kind, child, lenient)) out.push([p, child, kind])
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

/** The error label for an unsafe URL. */
export function unsafeUrlLabel(kind: UrlKind): string {
  return kind === 'href' ? 'link' : kind === 'image' ? 'image URL' : 'video link or embed code'
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
  /** Top-level keys holding a video link or iframe embed code. */
  embedKeys?(type: string): ReadonlySet<string>
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
    const unsafe = findUnsafeUrls(item.props, {
      maxDepth: limits.maxNestingDepth,
      lenient: true,
      embedKeys: catalog.embedKeys?.(item.type),
    })
    for (const [path, value, kind] of unsafe) {
      errors.push(`${label}.${path}: unsafe ${unsafeUrlLabel(kind)} "${value.slice(0, 80)}"`)
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
