import { isChallengesEnabled } from '@/lib/challenges/settings'

/** `/reto/<token>` with an optional locale prefix. Mirrors the token shape in `public-page.ts`. */
const CHALLENGE_PATH = /^(?:\/(?:en|es))?\/reto\/([A-Za-z0-9_-]{6,128})\/?$/

export function challengeTokenFromPath(pathname: string): string | null {
  return CHALLENGE_PATH.exec(pathname)?.[1] ?? null
}

/**
 * Whether `/reto/<token>` can possibly render on this host: the link exists,
 * is active, belongs to the host's school, and the school enabled challenges.
 * Only the proxy can answer with a real HTTP 404 here: `app/[locale]/loading.tsx`
 * wraps every page in Suspense, so a `notFound()` thrown by the page arrives
 * after the 200 status was streamed. The page still re-checks everything
 * (including the exercise state) and renders the 404 UI for what this misses.
 *
 * Fails OPEN on a lookup error: the page then decides.
 */
export async function challengeLinkResolves(
  token: string,
  tenantId: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<boolean> {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' }
  const get = async (path: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers })
    if (!res.ok) throw new Error(`lookup failed: ${res.status}`)
    return (await res.json()) as Array<Record<string, unknown>>
  }
  try {
    const [links, settings] = await Promise.all([
      get(`challenge_links?token=eq.${encodeURIComponent(token)}&select=tenant_id,active&limit=1`),
      get(`tenant_settings?tenant_id=eq.${tenantId}&setting_key=eq.challenges_enabled&select=setting_value&limit=1`),
    ])
    const link = links[0]
    if (!link || link.active !== true || link.tenant_id !== tenantId) return false
    return isChallengesEnabled(settings[0]?.setting_value)
  } catch {
    return true
  }
}
