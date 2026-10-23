import type { Data } from '@measured/puck'

/**
 * Global header / footer ("template parts"): the Header and Footer blocks of the school's
 * published home page are the site's header and footer. The public layout renders them around
 * every public route, so a course page, checkout or any landing page carries the same chrome.
 *
 * Pure module (type-only Puck import): safe from server and client code.
 */

export type GlobalPart = { type: 'Header' | 'Footer'; props: Record<string, unknown> }
export type GlobalParts = { header: GlobalPart | null; footer: GlobalPart | null }

type Block = { type?: string; props?: Record<string, unknown> }

function blocks(data: unknown): Block[] {
  const content = (data as { content?: unknown } | null)?.content
  return Array.isArray(content) ? (content as Block[]) : []
}

/** The first Header and Footer block of a page, or null for a part it does not have. */
export function extractGlobalParts(data: unknown): GlobalParts {
  const find = (type: GlobalPart['type']): GlobalPart | null => {
    const hit = blocks(data).find((b) => b?.type === type)
    return hit ? { type, props: hit.props ?? {} } : null
  }
  return { header: find('Header'), footer: find('Footer') }
}

/** A page's own header/footer blocks removed for each global part that exists. */
export function stripGlobalParts(data: Data, parts: Pick<GlobalParts, 'header' | 'footer'>): Data {
  const drop = new Set<string>([parts.header && 'Header', parts.footer && 'Footer'].filter(Boolean) as string[])
  const content = blocks(data).filter((b) => !drop.has(b?.type ?? ''))
  return { ...data, content: content as Data['content'] }
}

/** Page-level opt-out, authored on the Puck root: `globalParts: 'hide'` keeps the page's own blocks. */
export function pageUsesGlobalParts(data: unknown): boolean {
  const root = (data as { root?: { props?: Record<string, unknown> } & Record<string, unknown> } | null)?.root
  const props = root?.props ?? root ?? {}
  return props.globalParts !== 'hide'
}
