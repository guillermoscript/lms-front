/**
 * Read the Supabase session out of the auth cookie without a network call.
 *
 * `@supabase/ssr` ≥ 0.5 stores the session as `base64-<base64url(JSON)>`
 * (its `cookieEncoding: 'base64url'` default), split into `sb-*-auth-token.0`,
 * `.1`, … chunks when it outgrows one cookie. `proxy.ts` used to `JSON.parse`
 * the raw value, which throws on the prefix — inside a `try {} catch {}` — so
 * the tenant-claim sync it guards never ran: a member of two schools kept the
 * first school's `tenant_id` in every JWT and `get_tenant_id()` scoped all of
 * their RLS reads to the wrong tenant on the second school's subdomain (#672).
 *
 * Runtime-neutral on purpose (no `Buffer`): the proxy may run on the edge.
 */

const BASE64_PREFIX = 'base64-'
const AUTH_COOKIE = /^sb-.*-auth-token$/
const AUTH_COOKIE_CHUNK = /^sb-.*-auth-token\.(\d+)$/

export interface CookieLike {
  name: string
  value: string
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/** The raw cookie value, re-assembled from chunks in numeric order (`.10` after `.9`). */
export function rawSessionCookie(cookies: CookieLike[]): string | null {
  const whole = cookies.find((c) => AUTH_COOKIE.test(c.name))
  if (whole?.value) return whole.value

  const chunks = cookies
    .map((c) => ({ index: Number(AUTH_COOKIE_CHUNK.exec(c.name)?.[1]), value: c.value }))
    .filter((c) => Number.isInteger(c.index))
    .sort((a, b) => a.index - b.index)
  return chunks.length ? chunks.map((c) => c.value).join('') : null
}

/** The session's access token, or null when there is no readable session cookie. */
export function accessTokenFromCookies(cookies: CookieLike[]): string | null {
  const raw = rawSessionCookie(cookies)
  if (!raw) return null
  try {
    const json = raw.startsWith(BASE64_PREFIX) ? decodeBase64Url(raw.slice(BASE64_PREFIX.length)) : raw
    const session = JSON.parse(json)
    const token = session?.access_token ?? session?.[0]?.access_token
    return typeof token === 'string' && token.length > 0 ? token : null
  } catch {
    return null
  }
}

/** The JWT payload, unverified — only for routing hints; RLS re-checks the claims server-side. */
export function jwtClaims(accessToken: string): Record<string, unknown> | null {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    return JSON.parse(decodeBase64Url(payload))
  } catch {
    return null
  }
}
