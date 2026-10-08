/**
 * The ONE zone accessor (critique A5).
 *
 * Every read or write of a zone in core goes through `getZone`/`setZone`/`zoneKeys`. Today a
 * zone is `data.content` (root) or `data.zones[key]` (DropZone children); when the layout
 * blocks move to Puck slots, only this file learns about slot props and `applyOps`,
 * `findNode`, `outline` and the validators keep working unchanged.
 */
import { ROOT_ZONE, type Zone } from './ops'
import type { PageData, PageItem } from './types'

export { ROOT_ZONE }

/** `"<parentId>:<zoneName>"`. */
export function zoneKey(parentId: string, zoneName: string): Zone {
  return `${parentId}:${zoneName}`
}

/** Split a zone key into its parent id and zone name. The root zone has parent `root`. */
export function parseZone(zone: Zone): { parentId: string; zoneName: string } | null {
  const i = zone.indexOf(':')
  if (i <= 0 || i === zone.length - 1) return null
  return { parentId: zone.slice(0, i), zoneName: zone.slice(i + 1) }
}

/** The items of a zone, or `undefined` when the zone does not exist (yet). */
export function getZone(data: PageData, zone: Zone): PageItem[] | undefined {
  if (zone === ROOT_ZONE) return data.content
  return data.zones?.[zone]
}

/** Replace a zone's items (creates a DropZone entry when missing). Mutates `data`. */
export function setZone(data: PageData, zone: Zone, items: PageItem[]): void {
  if (zone === ROOT_ZONE) {
    data.content = items
    return
  }
  if (!data.zones) data.zones = {}
  data.zones[zone] = items
}

/** Remove a DropZone entry (never the root zone). Mutates `data`. */
export function deleteZone(data: PageData, zone: Zone): void {
  if (zone === ROOT_ZONE || !data.zones) return
  delete data.zones[zone]
}

/** Every zone key on the page, root first. */
export function zoneKeys(data: PageData): Zone[] {
  return [ROOT_ZONE, ...Object.keys(data.zones ?? {})]
}

/** The DropZone keys whose parent is `parentId`. */
export function childZoneKeys(data: PageData, parentId: string): Zone[] {
  const prefix = `${parentId}:`
  return zoneKeys(data).filter((z) => z !== ROOT_ZONE && z.startsWith(prefix))
}

export interface FoundNode {
  zone: Zone
  index: number
  item: PageItem
}

/** Locate a block by id in `content` or any zone. */
export function findNode(data: PageData, id: string): FoundNode | null {
  for (const zone of zoneKeys(data)) {
    const items = getZone(data, zone) ?? []
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      if (item?.props?.id === id) return { zone, index, item }
    }
  }
  return null
}

/** Every item on the page with its zone and index (zones in key order, items in order). */
export function allItems(data: PageData): FoundNode[] {
  const out: FoundNode[] = []
  for (const zone of zoneKeys(data)) {
    const items = getZone(data, zone) ?? []
    items.forEach((item, index) => out.push({ zone, index, item }))
  }
  return out
}

/** Ids of the block's descendants (children of its zones, recursively). */
export function descendantIds(data: PageData, id: string): string[] {
  const out: string[] = []
  const stack = [id]
  const seen = new Set<string>([id])
  while (stack.length) {
    const parent = stack.pop()!
    for (const zone of childZoneKeys(data, parent)) {
      for (const child of getZone(data, zone) ?? []) {
        const cid = child?.props?.id
        if (typeof cid === 'string' && !seen.has(cid)) {
          seen.add(cid)
          out.push(cid)
          stack.push(cid)
        }
      }
    }
  }
  return out
}

/**
 * Does a zone exist or can it be created? A new zone needs its parent block on the page and,
 * when `acceptsZone` is given, a parent type that renders a DropZone of that name: content
 * put in `HeroBlock-x:main` would be saved but never shown.
 */
export function zoneIsAddressable(
  data: PageData,
  zone: Zone,
  acceptsZone?: (type: string, zoneName: string) => boolean
): boolean {
  if (zone === ROOT_ZONE) return true
  if (getZone(data, zone)) return true
  const parsed = parseZone(zone)
  if (!parsed || parsed.parentId === 'root') return false
  const parent = findNode(data, parsed.parentId)
  if (!parent) return false
  return acceptsZone ? acceptsZone(parent.item.type, parsed.zoneName) : true
}

/** Does a DropZone name match one of a block's declared names (`col-*` = `col-` + digits)? */
export function zoneNameMatches(declared: readonly string[] | undefined, name: string): boolean {
  return (declared ?? []).some((d) => {
    if (!d.endsWith('*')) return d === name
    const prefix = d.slice(0, -1)
    return name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length))
  })
}

/** An empty page. */
export function emptyPage(rootProps: Record<string, unknown> = {}): PageData {
  return { root: { props: { ...rootProps } }, content: [], zones: {} }
}
