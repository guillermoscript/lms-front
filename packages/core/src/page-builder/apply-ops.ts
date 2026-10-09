/**
 * The pure op reducer (design §3.2, critique A1/A5).
 *
 * `applyOps(data, ops, catalog)` is TOTAL: an op on an unknown id, zone or type is skipped
 * and reported as a warning, and the rest still apply. It is the same reducer the server's
 * shadow page, the MCP patch tool and the tests run; the editor maps the same ops onto Puck
 * `dispatch` calls instead.
 */
import { resolveAppends } from './appends'
import { applyArrayDefaults } from './array-defaults'
import { newBlockId, type IdFactory } from './ids'
import { localizeTemplateCopy, type TemplateLocale } from './template-i18n'
import { ROOT_ZONE, type AddOp, type PageOp, type Zone } from './ops'
import {
  childZoneKeys,
  deleteZone,
  descendantIds,
  findNode,
  getZone,
  parseZone,
  setZone,
  zoneIsAddressable,
  zoneKey,
} from './tree'
import type { ManifestField, PageData, PageItem } from './types'

/** The slice of the catalog the reducer needs (the full `PageCatalog` satisfies it). */
export interface OpsCatalog {
  has(type: string): boolean
  defaultProps(type: string): Record<string, unknown>
  fields(type: string): Record<string, ManifestField> | undefined
  /** Does `type` render a DropZone named `zoneName`? Omitted = any zone of an existing block. */
  acceptsZone?(type: string, zoneName: string): boolean
}

/**
 * `catalog` with its `defaultProps` in `locale`: the copy a block gets for every prop an `add`
 * op leaves out, so a new block on a Spanish page reads Spanish (as the editor's own Puck
 * config does). Same dictionary and copy-key filter as the templates; English = `catalog`.
 */
export function localizeDefaults<C extends OpsCatalog>(catalog: C, locale: TemplateLocale | null | undefined): C {
  if (!locale || locale === 'en') return catalog
  return { ...catalog, defaultProps: (type: string) => localizeTemplateCopy(catalog.defaultProps(type), locale) }
}

const zoneCheck = (catalog?: OpsCatalog) =>
  catalog?.acceptsZone ? (type: string, name: string) => catalog.acceptsZone!(type, name) : undefined

export interface ApplyOpsResult {
  data: PageData
  warnings: string[]
  /** How many ops changed the page. */
  applied: number
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T)
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function withoutId(props: Record<string, unknown> | undefined): Record<string, unknown> {
  const rest = { ...(props ?? {}) }
  delete rest.id
  return rest
}

/**
 * Apply one op to `data` IN PLACE. Returns a warning string when the op was skipped, null
 * when it applied. Op payloads are deep-copied, never aliased into the page.
 */
export function applyOpInPlace(data: PageData, op: PageOp, catalog?: OpsCatalog): string | null {
  switch (op.op) {
    case 'add': {
      if (catalog && !catalog.has(op.type)) return `add: unknown block type "${op.type}"`
      if (findNode(data, op.id)) return `add: id "${op.id}" already exists`
      if (!zoneIsAddressable(data, op.zone, zoneCheck(catalog))) return `add: zone "${op.zone}" does not exist`
      const items = (getZone(data, op.zone) ?? []).slice()
      const index = clamp(op.index, 0, items.length)
      const fields = catalog?.fields(op.type)
      const props = applyArrayDefaults(
        { ...clone(catalog?.defaultProps(op.type) ?? {}), ...clone(withoutId(op.props)) },
        fields
      )
      items.splice(index, 0, { type: op.type, props: { ...props, id: op.id } })
      setZone(data, op.zone, items)
      return null
    }

    case 'update': {
      const node = findNode(data, op.id)
      if (!node) return `update: no block with id "${op.id}"`
      const incoming = clone(withoutId(op.props))
      const fields = catalog?.fields(node.item.type)
      const merged = { ...node.item.props, ...applyArrayDefaults(incoming, fields) }
      const { props, warnings } = resolveAppends(merged, op.appends, new Set(Object.keys(incoming)))
      const items = (getZone(data, node.zone) ?? []).slice()
      items[node.index] = { ...node.item, props: { ...props, id: op.id } as PageItem['props'] }
      setZone(data, node.zone, items)
      return warnings.length ? `update "${op.id}": ${warnings.join('; ')}` : null
    }

    case 'updateRoot': {
      const incoming = clone(op.props ?? {})
      const merged = { ...(data.root?.props ?? {}), ...incoming }
      const { props, warnings } = resolveAppends(merged, op.appends, new Set(Object.keys(incoming)))
      data.root = { ...(data.root ?? {}), props }
      return warnings.length ? `updateRoot: ${warnings.join('; ')}` : null
    }

    case 'move': {
      const node = findNode(data, op.id)
      if (!node) return `move: no block with id "${op.id}"`
      if (!zoneIsAddressable(data, op.zone, zoneCheck(catalog))) return `move: zone "${op.zone}" does not exist`
      const target = parseZone(op.zone)
      if (op.zone !== ROOT_ZONE && target) {
        if (target.parentId === op.id || descendantIds(data, op.id).includes(target.parentId)) {
          return `move: cannot move "${op.id}" into its own zone`
        }
      }
      const source = (getZone(data, node.zone) ?? []).slice()
      source.splice(node.index, 1)
      setZone(data, node.zone, source)
      const dest = (getZone(data, op.zone) ?? []).slice()
      dest.splice(clamp(op.index, 0, dest.length), 0, node.item)
      setZone(data, op.zone, dest)
      return null
    }

    case 'remove': {
      const node = findNode(data, op.id)
      if (!node) return `remove: no block with id "${op.id}"`
      const doomed = [op.id, ...descendantIds(data, op.id)]
      const items = (getZone(data, node.zone) ?? []).slice()
      items.splice(node.index, 1)
      setZone(data, node.zone, items)
      for (const id of doomed) for (const z of childZoneKeys(data, id)) deleteZone(data, z)
      return null
    }

    case 'reset': {
      data.root = { props: clone(op.root ?? {}) }
      data.content = []
      data.zones = {}
      return null
    }

    default: {
      const unknown = op as { op?: unknown }
      return `unknown op "${String(unknown.op)}"`
    }
  }
}

/** Apply ops to a deep copy of `data`. The input is never mutated. */
export function applyOps(data: PageData, ops: readonly PageOp[], catalog?: OpsCatalog): ApplyOpsResult {
  const next = clone(data) ?? { root: { props: {} }, content: [], zones: {} }
  if (!Array.isArray(next.content)) next.content = []
  if (!next.root || typeof next.root !== 'object') next.root = { props: {} }
  const warnings: string[] = []
  let applied = 0
  for (const op of ops) {
    const warning = applyOpInPlace(next, op, catalog)
    if (warning === null) applied++
    else warnings.push(warning)
  }
  return { data: next, warnings, applied }
}

// ── Subtree cloning (duplicate, templates, presets) ────────────────────────────────────

export interface SubtreeOpsResult {
  ops: AddOp[]
  /** Old id → new id, for every cloned block. */
  idMap: Record<string, string>
}

/**
 * Turn `items` (and, recursively, their DropZone children in `source`) into `add` ops with
 * fresh ids, inserted at `target.zone`/`target.index`. Child zones are re-keyed onto the new
 * parent ids (`<newId>:<zone>`), and a parent's `add` always precedes its children's.
 */
export function subtreeToAddOps(
  source: PageData,
  items: readonly PageItem[],
  target: { zone: Zone; index: number },
  idFactory: IdFactory = newBlockId
): SubtreeOpsResult {
  const ops: AddOp[] = []
  const idMap: Record<string, string> = {}
  const visit = (list: readonly PageItem[], zone: Zone, start: number) => {
    list.forEach((item, i) => {
      const oldId = item.props?.id
      const id = idFactory(item.type)
      if (typeof oldId === 'string') idMap[oldId] = id
      ops.push({ op: 'add', id, type: item.type, zone, index: start + i, props: clone(withoutId(item.props)) })
      if (typeof oldId !== 'string') return
      for (const childZone of childZoneKeys(source, oldId)) {
        const zoneName = parseZone(childZone)!.zoneName
        visit(getZone(source, childZone) ?? [], zoneKey(id, zoneName), 0)
      }
    })
  }
  visit(items, target.zone, target.index)
  return { ops, idMap }
}

/**
 * Expand a duplicate request into `add` ops (critique A1: no `duplicate` on the wire). The
 * copy lands right after the original, in the same zone, with fresh ids for it and every
 * nested child. Returns null when the id is unknown.
 */
export function expandDuplicate(
  data: PageData,
  id: string,
  idFactory: IdFactory = newBlockId
): { ops: AddOp[]; newId: string } | null {
  const node = findNode(data, id)
  if (!node) return null
  const { ops, idMap } = subtreeToAddOps(data, [node.item], { zone: node.zone, index: node.index + 1 }, idFactory)
  return { ops, newId: idMap[id] }
}
