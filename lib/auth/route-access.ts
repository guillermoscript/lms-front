import { locales } from '@/i18n'
import { getSafeNextPath } from './safe-next-path'

/**
 * Route classification shared by `proxy.ts` and the auth landing routes.
 *
 * Every path under one of these prefixes needs a session; `proxy.ts` sends
 * an anonymous visitor to `/auth/login?next=<path>` and runs the tenant
 * membership and role guards on the rest. Everything else is public —
 * including a path that matches no route, which must reach Next's
 * `not-found` (404) rather than the login wall (#728). A route that lands
 * under a new top-level segment is public until it is listed here.
 *
 * `/join-school` needs a session but is exempt from the membership check —
 * it is where a non-member is sent to become one.
 */
export const PROTECTED_PREFIXES = [
  '/dashboard',
  '/checkout',
  '/platform',
  '/onboarding',
  '/join-school',
] as const

/** Locale-less path (`/dashboard/student`, `/checkout?courseId=1`) → needs a session. */
export function isProtectedPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0]
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Prefix `path` with `/<locale>` unless it already carries a supported locale.
 * Producers pass locale-less `next` values (`/products/1`); a redirect built
 * from one must not bounce through the locale redirect a second time.
 */
export function localizePath(path: string, locale: string): string {
  const [first] = path.slice(1).split(/[/?#]/, 1)
  if ((locales as readonly string[]).includes(first)) return path
  return `/${locale}${path}`
}

/** Locale-less login URL that returns to `returnTo` after sign-in. */
export function loginPath(returnTo: string): string {
  return `/auth/login?next=${encodeURIComponent(returnTo)}`
}

/**
 * Locale-less join URL carrying `next` — where a non-member is sent so the
 * page or purchase they came for survives the join step. A `next` that is
 * itself the join page is returned verbatim, and an unsafe one is dropped.
 */
export function joinSchoolPath(next?: string | null): string {
  const safe = getSafeNextPath(next, '')
  if (!safe) return '/join-school'
  if (safe === '/join-school' || /^\/join-school[/?#]/.test(safe)) return safe
  return `/join-school?next=${encodeURIComponent(safe)}`
}
