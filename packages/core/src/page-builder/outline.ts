/**
 * The compact page view the model works from (design §3.2): one line per block with its id,
 * type, zone and a short summary of its main text. `get_page` returns it, and the system
 * prompt embeds it with the selected block marked.
 */
import { ROOT_ZONE } from './ops'
import { childZoneKeys, getZone, parseZone } from './tree'
import type { PageData, PageItem } from './types'

export interface OutlineEntry {
  id: string
  type: string
  zone: string
  index: number
  depth: number
  summary: string
}

const SUMMARY_KEYS = ['title', 'headline', 'heading', 'text', 'label', 'logoText', 'question', 'content', 'body', 'subtitle', 'description']

function summarize(item: PageItem, max: number): string {
  const props = item.props ?? {}
  for (const key of SUMMARY_KEYS) {
    const v = props[key]
    if (typeof v === 'string' && v.trim()) {
      const s = v.replace(/\s+/g, ' ').trim()
      return s.length > max ? `${s.slice(0, max - 1)}…` : s
    }
  }
  for (const [key, v] of Object.entries(props)) {
    if (Array.isArray(v) && v.length) return `${v.length} ${key}`
  }
  return ''
}

/** Depth-first outline: each block, then the blocks in its DropZones. */
export function outline(data: PageData, opts: { summaryLength?: number } = {}): OutlineEntry[] {
  const max = opts.summaryLength ?? 80
  const out: OutlineEntry[] = []
  const visit = (zone: string, depth: number) => {
    const items = getZone(data, zone) ?? []
    items.forEach((item, index) => {
      const id = item?.props?.id
      if (typeof id !== 'string') return
      out.push({ id, type: item.type, zone, index, depth, summary: summarize(item, max) })
      if (depth < 8) for (const child of childZoneKeys(data, id)) visit(child, depth + 1)
    })
  }
  visit(ROOT_ZONE, 0)
  return out
}

/** The outline as prompt text; `selectedId` is marked with `<- selected`. */
export function formatOutline(data: PageData, selectedId?: string | null): string {
  const entries = outline(data)
  if (!entries.length) return '(empty page)'
  return entries
    .map((e) => {
      const indent = '  '.repeat(e.depth)
      const zone = e.zone === ROOT_ZONE ? '' : ` in ${parseZone(e.zone)?.zoneName ?? e.zone}`
      const summary = e.summary ? ` "${e.summary}"` : ''
      const mark = e.id === selectedId ? '  <- selected' : ''
      return `${indent}${e.index}. ${e.type} [${e.id}]${zone}${summary}${mark}`
    })
    .join('\n')
}
