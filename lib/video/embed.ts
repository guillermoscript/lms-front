/**
 * Single source of truth for turning a pasted video link (or iframe snippet)
 * into a safe embed URL. Used by the lesson player, the lesson editor preview,
 * the block editor and the public Video component.
 *
 * Add a platform by appending to PROVIDERS — nothing else needs to change.
 */

export type EmbedProviderId =
  | 'youtube'
  | 'vimeo'
  | 'loom'
  | 'cap'
  | 'wistia'
  | 'dailymotion'
  | 'iframe'

export interface ResolvedEmbed {
  provider: EmbedProviderId
  embedUrl: string
}

interface Provider {
  id: EmbedProviderId
  resolve: (url: URL) => string | null
}

const stripWww = (host: string) => host.replace(/^www\./, '').replace(/^m\./, '')

/**
 * Hosts that run a Cap instance (https://cap.so). Cap links are
 * `https://<host>/s/<id>` and embed at `https://<host>/embed/<id>`.
 * `cap.so` and any `cap.*` subdomain are recognized out of the box; add custom
 * domains via NEXT_PUBLIC_CAP_HOSTS (comma-separated).
 */
function isCapHost(host: string): boolean {
  if (host === 'cap.so' || host.startsWith('cap.')) return true
  const extra = (process.env.NEXT_PUBLIC_CAP_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return extra.includes(host)
}

const PROVIDERS: Provider[] = [
  {
    id: 'youtube',
    resolve: (u) => {
      const host = stripWww(u.hostname)
      let id: string | null = null
      if (host === 'youtu.be') {
        id = u.pathname.slice(1).split('/')[0]
      } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        id =
          u.searchParams.get('v') ??
          u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1] ??
          null
      }
      return id && /^[\w-]{11}$/.test(id)
        ? `https://www.youtube.com/embed/${id}`
        : null
    },
  },
  {
    id: 'vimeo',
    resolve: (u) => {
      const host = stripWww(u.hostname)
      if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null
      const m = u.pathname.match(
        /^\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)(?:\/([\da-f]+))?/
      )
      if (!m) return null
      // Unlisted videos carry a privacy hash: vimeo.com/ID/HASH or ?h=HASH
      const hash = m[2] ?? u.searchParams.get('h')
      return `https://player.vimeo.com/video/${m[1]}${hash ? `?h=${hash}` : ''}`
    },
  },
  {
    id: 'loom',
    resolve: (u) => {
      if (stripWww(u.hostname) !== 'loom.com') return null
      const m = u.pathname.match(/^\/(?:share|embed)\/([\da-f]{32})/)
      return m ? `https://www.loom.com/embed/${m[1]}` : null
    },
  },
  {
    id: 'cap',
    resolve: (u) => {
      const host = u.hostname.toLowerCase()
      if (!isCapHost(host)) return null
      const m = u.pathname.match(/^\/(?:s|embed)\/([\w-]+)/)
      return m ? `${u.origin}/embed/${m[1]}` : null
    },
  },
  {
    id: 'wistia',
    resolve: (u) => {
      const host = stripWww(u.hostname)
      if (!host.endsWith('wistia.com') && !host.endsWith('wi.st')) return null
      const m = u.pathname.match(/\/(?:medias|embed\/iframe)\/([\w]+)/)
      return m ? `https://fast.wistia.net/embed/iframe/${m[1]}` : null
    },
  },
  {
    id: 'dailymotion',
    resolve: (u) => {
      const host = stripWww(u.hostname)
      if (host === 'dai.ly') {
        const id = u.pathname.slice(1)
        return /^\w+$/.test(id)
          ? `https://www.dailymotion.com/embed/video/${id}`
          : null
      }
      if (host !== 'dailymotion.com') return null
      const m = u.pathname.match(/^\/(?:embed\/)?video\/(\w+)/)
      return m ? `https://www.dailymotion.com/embed/video/${m[1]}` : null
    },
  },
]

/** Pull the `src` out of a pasted `<iframe …>` snippet. https only. */
function extractIframeSrc(input: string): string | null {
  if (!/<iframe[\s>]/i.test(input)) return null
  const m = input.match(/<iframe[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i)
  if (!m) return null
  const src = m[1].trim().replace(/^\/\//, 'https://')
  return /^https:\/\//i.test(src) ? src : null
}

/**
 * Resolve a pasted link or `<iframe>` snippet into an embed URL.
 *
 * - Known platforms are normalized to their canonical embed URL.
 * - Any other platform works if the user pastes its iframe embed code: the
 *   `src` is used as-is (https only; the iframe is always rendered with our
 *   own attributes, never the pasted markup).
 * - Returns null for anything else (caller shows "unrecognized").
 */
export function resolveVideoEmbed(input: string | null | undefined): ResolvedEmbed | null {
  const raw = input?.trim()
  if (!raw) return null

  const candidate = extractIframeSrc(raw) ?? raw
  const fromIframe = candidate !== raw

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  for (const p of PROVIDERS) {
    const embedUrl = p.resolve(url)
    if (embedUrl) return { provider: p.id, embedUrl }
  }

  return fromIframe ? { provider: 'iframe', embedUrl: url.toString() } : null
}

export function getEmbedUrl(input: string | null | undefined): string | null {
  return resolveVideoEmbed(input)?.embedUrl ?? null
}

export const VIDEO_IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
