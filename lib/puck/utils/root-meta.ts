import type { Fields } from '@measured/puck'

/**
 * Page-level SEO fields on Puck's `root` (Page Architect WP4, design §3.7).
 *
 * `rootMetaFields` is registered as `config.root.fields` in `lib/puck/config.ts`;
 * `readRootMeta()` is what the public `/p/[slug]` metadata reads. Pure module
 * (type-only Puck import) so a server route can use it without pulling the
 * editor bundle in — never import `lib/puck/config.ts` server side.
 */

export type RootMetaProps = {
  /** `<title>` / og:title. Empty → the page's own title. */
  metaTitle: string
  /** meta description / og:description. Empty → none. */
  metaDescription: string
  /** og:image URL (https or a site path). Empty → the generated OG card. */
  ogImage: string
}

export const ROOT_META_LIMITS = { metaTitle: 70, metaDescription: 160 } as const

export const rootMetaFields: Fields<RootMetaProps> = {
  metaTitle: { type: 'text', label: 'SEO Title' },
  metaDescription: { type: 'textarea', label: 'SEO Description' },
  ogImage: { type: 'text', label: 'Share Image URL' },
}

export const rootMetaDefaults: RootMetaProps = {
  metaTitle: '',
  metaDescription: '',
  ogImage: '',
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean) return undefined
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/** An og:image must be an absolute https URL or a same-site path; anything else is dropped. */
export function safeOgImage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!v) return undefined
  if (v.startsWith('/')) return v.startsWith('//') || v.startsWith('/\\') ? undefined : v
  try {
    const url = new URL(v)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/**
 * The SEO overrides stored on a page's `puck_data.root.props`, sanitised.
 * Each key is present only when the author set a usable value. Accepts the
 * legacy Puck shape too (root props spread directly on `root`).
 */
export function readRootMeta(puckData: unknown): { title?: string; description?: string; image?: string } {
  const root = (puckData as { root?: { props?: Record<string, unknown> } & Record<string, unknown> } | null)?.root
  const props: Record<string, unknown> = root?.props ?? root ?? {}
  const title = text(props.metaTitle, ROOT_META_LIMITS.metaTitle * 2)
  const description = text(props.metaDescription, ROOT_META_LIMITS.metaDescription * 2)
  const image = safeOgImage(props.ogImage)
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
  }
}
