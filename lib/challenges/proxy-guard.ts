import { NextResponse, type NextRequest } from 'next/server'
import { isChallengesEnabled } from '@/lib/challenges/settings'

/** Mirrors the token shape in `public-page.ts`. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{6,128}$/
const CHALLENGE_PATH = /^(?:\/(en|es))?\/reto\/([^/]+)(\/.*)?$/

export type ChallengePath = { kind: 'token'; token: string } | { kind: 'malformed' } | null

/**
 * `null` = not a challenge URL. `malformed` = a token that can never exist or an
 * extra path segment: 404 without touching the database.
 */
export function classifyChallengePath(pathname: string): ChallengePath {
  const m = CHALLENGE_PATH.exec(pathname)
  if (!m) return null
  const [, , token, rest] = m
  if (!TOKEN_SHAPE.test(token) || (rest && rest !== '/')) return { kind: 'malformed' }
  return { kind: 'token', token }
}

const LOOKUP_TIMEOUT_MS = 1500
const LOOKUP_TTL_MS = 15_000
const lookupCache = new Map<string, { ok: boolean; expiresAt: number }>()

/** Test seam. */
export function clearChallengeLookupCache() {
  lookupCache.clear()
}

/**
 * Whether `/reto/<token>` can possibly render on this host: the link exists,
 * is active, belongs to the host's school, and the school enabled challenges.
 * Only the proxy can answer with a real HTTP 404 here: `app/[locale]/loading.tsx`
 * wraps every page in Suspense, so a `notFound()` thrown by the page arrives
 * after the 200 status was streamed. The page still re-checks everything
 * (including the exercise state).
 *
 * Results are cached for a few seconds (a deactivated link keeps resolving for
 * at most that long at the proxy; the page and the attempt API check live).
 * Fails OPEN on a lookup error or timeout so the page decides; the error is
 * logged (never the key or the token).
 */
export async function challengeLinkResolves(
  token: string,
  tenantId: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<boolean> {
  const key = `${tenantId}:${token}`
  const cached = lookupCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.ok

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' }
  const get = async (path: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`lookup failed: HTTP ${res.status}`)
    return (await res.json()) as Array<Record<string, unknown>>
  }
  try {
    const [links, settings] = await Promise.all([
      get(`challenge_links?token=eq.${encodeURIComponent(token)}&select=tenant_id,active&limit=1`),
      get(`tenant_settings?tenant_id=eq.${tenantId}&setting_key=eq.challenges_enabled&select=setting_value&limit=1`),
    ])
    const link = links[0]
    const ok =
      !!link && link.active === true && link.tenant_id === tenantId && isChallengesEnabled(settings[0]?.setting_value)
    if (lookupCache.size > 2000) lookupCache.clear()
    lookupCache.set(key, { ok, expiresAt: Date.now() + LOOKUP_TTL_MS })
    return ok
  } catch (err) {
    console.error('[challenges/proxy-guard] lookup failed, letting the page decide:', err instanceof Error ? err.message : 'unknown error')
    return true
  }
}

/** Route that only calls `notFound()`: it renders the branded `app/[locale]/not-found.tsx`. */
export const CHALLENGE_NOT_FOUND_ROUTE = 'reto-not-found'

/**
 * A real-404 rewrite for a dead challenge URL, or `null` to continue. The
 * rewrite carries `request` so the headers the proxy set (`x-tenant-id`)
 * reach the not-found page and it resolves the school's branding.
 */
export async function guardChallengePath(opts: {
  request: NextRequest
  pathname: string
  tenantId: string
  locales: readonly string[]
  defaultLocale: string
  supabaseUrl: string
  serviceKey: string
}): Promise<NextResponse | null> {
  const parsed = classifyChallengePath(opts.pathname)
  if (!parsed) return null
  if (parsed.kind === 'token' && (await challengeLinkResolves(parsed.token, opts.tenantId, opts.supabaseUrl, opts.serviceKey))) {
    return null
  }
  const first = opts.pathname.split('/')[1]
  const locale = opts.locales.includes(first) ? first : opts.defaultLocale
  return NextResponse.rewrite(new URL(`/${locale}/${CHALLENGE_NOT_FOUND_ROUTE}`, opts.request.url), {
    request: opts.request,
    status: 404,
  })
}
