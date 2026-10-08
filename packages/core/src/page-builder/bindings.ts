/**
 * Template instantiation primitives (design §5, critique D4/D5).
 *
 * Kept free of the generated files on purpose: `lib/puck/templates/_shared.ts` imports this
 * module, and the codegen script imports the templates — so this file must load before any
 * generated file exists.
 *
 * - Bindings: a template string may hold `{{courseId}}`, `{{productId}}`, `{{schoolName}}`,
 *   `{{year}}` or `{{logoUrl}}`. A value that is exactly one token takes the binding's value;
 *   tokens inside text are replaced inline; a list entry that was a lone token and resolved
 *   empty (`[{id:'{{courseId}}'}]` with no course) is dropped.
 * - List bindings: a list entry that is a lone `{{courseIds}}` token (`[{id:'{{courseIds}}'}]`)
 *   expands into one entry per id, in the same shape (the product-bundle CourseGrid binds the
 *   bundle's courses this way). Unbound, it expands into nothing.
 * - Fresh ids: every block (content AND zones) gets a new id, and DropZone keys
 *   `<oldParent>:<zone>` are re-keyed onto the new parent ids (the old clone forgot this).
 */
import { newBlockId, type IdFactory } from './ids'
import { ROOT_ZONE } from './ops'
import { parseZone } from './tree'
import type { PageData, PageItem } from './types'

export const TEMPLATE_BINDING_KEYS = ['courseId', 'productId', 'schoolName', 'year', 'logoUrl'] as const
export type TemplateBindingKey = (typeof TEMPLATE_BINDING_KEYS)[number]
export const TEMPLATE_LIST_BINDING_KEYS = ['courseIds'] as const
export type TemplateListBindingKey = (typeof TEMPLATE_LIST_BINDING_KEYS)[number]
export type TemplateBindings = Partial<Record<TemplateBindingKey, string | number | null | undefined>> &
  Partial<Record<TemplateListBindingKey, ReadonlyArray<string | number> | null | undefined>>

/** Fallbacks for unbound tokens: ids and the logo resolve empty, the year is the current one. */
export function defaultBindings(): Record<TemplateBindingKey, string> {
  return { courseId: '', productId: '', schoolName: 'Academy', year: String(new Date().getFullYear()), logoUrl: '' }
}

interface ResolvedBindings {
  values: Record<string, string>
  lists: Record<string, string[]>
}

function resolveBindings(bindings: TemplateBindings | undefined): ResolvedBindings {
  const values: Record<string, string> = defaultBindings()
  for (const key of TEMPLATE_BINDING_KEYS) {
    const v = bindings?.[key]
    if (v !== undefined && v !== null && String(v).trim() !== '') values[key] = String(v).trim()
  }
  const lists: Record<string, string[]> = {}
  for (const key of TEMPLATE_LIST_BINDING_KEYS) {
    const v = bindings?.[key]
    const ids = Array.isArray(v) ? v.map((id) => String(id).trim()).filter(Boolean) : []
    lists[key] = [...new Set(ids)]
  }
  return { values, lists }
}

const TOKEN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g
const LONE_TOKEN = /^\{\{\s*([a-zA-Z]+)\s*\}\}$/

function isLoneToken(v: unknown, values: Record<string, string>): boolean {
  if (typeof v === 'string') {
    const m = LONE_TOKEN.exec(v)
    return !!m && m[1] in values
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v)
    return keys.length === 1 && keys[0] === 'id' && isLoneToken((v as { id: unknown }).id, values)
  }
  return false
}

/** The list-binding key when `v` is a lone `{{courseIds}}` (string or `{id}`), else null. */
function loneListToken(v: unknown, lists: Record<string, string[]>): string | null {
  const raw = typeof v === 'string' ? v : isIdOnly(v) ? v.id : null
  if (typeof raw !== 'string') return null
  const m = LONE_TOKEN.exec(raw)
  return m && m[1] in lists ? m[1] : null
}

function isIdOnly(v: unknown): v is { id: unknown } {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && 'id' in v
}

function substitute(value: unknown, b: ResolvedBindings): unknown {
  const { values, lists } = b
  if (typeof value === 'string') {
    return value.replace(TOKEN, (whole, key: string) =>
      key in values ? values[key] : key in lists ? lists[key].join(',') : whole
    )
  }
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const v of value) {
      const listKey = loneListToken(v, lists)
      if (listKey) {
        for (const id of lists[listKey]) out.push(typeof v === 'string' ? id : { id })
        continue
      }
      const next = substitute(v, b)
      // A lone binding that resolved empty means "no binding": drop the list entry.
      if (isLoneToken(v, values) && (next === '' || (next as { id?: unknown })?.id === '')) continue
      out.push(next)
    }
    return out
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = substitute(v, b)
    return out
  }
  return value
}

/** Replace binding tokens anywhere in `value` (returns a copy). Unbound tokens use `defaultBindings()`. */
export function substituteBindings<T>(value: T, bindings?: TemplateBindings): T {
  return substitute(value, resolveBindings(bindings)) as T
}

/** Does `value` still contain any binding token? */
export function hasBindingTokens(value: unknown): boolean {
  return /\{\{\s*(courseIds|courseId|productId|schoolName|year|logoUrl)\s*\}\}/.test(JSON.stringify(value) ?? '')
}

export interface CloneOptions {
  idFactory?: IdFactory
  /** Substitute binding tokens; `false` leaves them in place. Defaults to fallbacks only. */
  bindings?: TemplateBindings | false
}

/**
 * Deep-clone a page with fresh ids for every block and DropZone keys re-keyed onto the new
 * parent ids. Zones whose parent is not on the page keep their key (they are orphans either
 * way). Binding tokens are substituted unless `bindings === false`.
 */
export function cloneWithFreshIds(data: PageData, opts: CloneOptions = {}): PageData {
  const idFactory = opts.idFactory ?? newBlockId
  const copy = JSON.parse(JSON.stringify(data)) as PageData
  const idMap = new Map<string, string>()
  const refresh = (item: PageItem): PageItem => {
    const old = item?.props?.id
    if (typeof old !== 'string' || !item.props) return item
    const next = idFactory(item.type)
    idMap.set(old, next)
    return { ...item, props: { ...item.props, id: next } }
  }
  const content = (copy.content ?? []).map(refresh)
  const freshZones: Array<[string, PageItem[]]> = Object.entries(copy.zones ?? {}).map(([k, items]) => [
    k,
    (items ?? []).map(refresh),
  ])
  const zones: Record<string, PageItem[]> = {}
  for (const [key, items] of freshZones) {
    const parsed = key === ROOT_ZONE ? null : parseZone(key)
    const parent = parsed ? idMap.get(parsed.parentId) : undefined
    zones[parent ? `${parent}:${parsed!.zoneName}` : key] = items
  }
  const out: PageData = { ...copy, root: copy.root ?? { props: {} }, content, zones }
  return opts.bindings === false ? out : substituteBindings(out, opts.bindings)
}
