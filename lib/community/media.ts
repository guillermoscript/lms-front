export type CommunityMedia = { url: string; type: 'image' | 'video' | 'file'; name: string }

export const MAX_POST_MEDIA = 4

const MEDIA_TYPES = new Set<CommunityMedia['type']>(['image', 'video', 'file'])

/**
 * Parse the `media_urls` a composer sends with a post (#860).
 *
 * Only files `uploadCommunityAsset` put in the poster's own folder
 * (`community-assets/{tenantId}/{userId}/`) are accepted — a post never
 * carries an arbitrary URL, which would otherwise render as an `<img>`/`<a>`
 * for every member. Returns `null` when the payload is malformed.
 */
export function parsePostMedia(
  raw: string | null,
  { supabaseUrl, tenantId, userId }: { supabaseUrl: string; tenantId: string; userId: string }
): CommunityMedia[] | null {
  if (!raw) return []

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(value) || value.length > MAX_POST_MEDIA) return null

  const prefix = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/community-assets/${tenantId}/${userId}/`
  const media: CommunityMedia[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const { url, type, name } = item as Record<string, unknown>
    if (typeof url !== 'string' || typeof name !== 'string' || typeof type !== 'string') return null
    if (!MEDIA_TYPES.has(type as CommunityMedia['type'])) return null
    // Folder-scoped and no traversal out of it.
    if (!url.startsWith(prefix) || url.includes('..') || url.slice(prefix.length).includes('/')) return null
    media.push({ url, type: type as CommunityMedia['type'], name: name.slice(0, 200) })
  }

  return media
}
