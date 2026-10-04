/**
 * Traffic exclusions — who and what NEVER reaches OpenPanel.
 *
 * Source: `docs/ANALYTICS_OPENPANEL.md` §9.6. The reasoning is scale, not
 * privacy: production is currently ~17 users, so the team plus Playwright are
 * plausibly 30–50% of all sessions. Unfiltered, every chart measures us.
 *
 * This module is imported by BOTH `server.ts` and `client.ts` so the two can
 * never drift. It therefore reads only `NEXT_PUBLIC_*` vars and `NODE_ENV`
 * (a server-only var would silently evaluate to `undefined` in the browser
 * bundle and the two sides would disagree).
 *
 * Each `process.env.NEXT_PUBLIC_…` lookup is written out literally on purpose:
 * Next.js inlines those at build time by textual substitution, so a computed
 * lookup like `process.env[name]` would resolve to `undefined` in the browser.
 */

/** Everything the exclusion predicate needs. Nothing here costs a DB round trip. */
export type AnalyticsExclusionContext = {
  /**
   * Request path, locale prefix optional (`/en/platform/x` and `/platform/x`
   * are both recognised).
   */
  path?: string | null
  /**
   * Passed in by the caller — resolved from `isSuperAdmin()`
   * (`lib/supabase/get-user-role.ts`), which is `React.cache()`d per request
   * tree. Never call it from here: an analytics event must not add a query.
   */
  isSuperAdmin?: boolean | null
  /**
   * `app/actions/platform/impersonate.ts` sessions — otherwise our debugging
   * gets attributed to a real student.
   */
  isImpersonating?: boolean | null
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

function isFlagOn(value: string | undefined): boolean {
  return TRUE_VALUES.has((value ?? '').trim().toLowerCase())
}

/**
 * Hard kill switch. Set `NEXT_PUBLIC_ANALYTICS_DISABLED=true` in the E2E
 * environment and nothing is emitted at all.
 *
 * WHY A FLAG AND NOT AN ACCOUNT LIST: §9.6 asks us to drop the four seeded E2E
 * accounts (`student@e2etest.com`, `owner@e2etest.com`,
 * `creator@codeacademy.com`, `alice@student.com`). We cannot match on email —
 * `profiles` has no email column, and resolving one would mean an
 * `auth.admin.getUserById()` call on every event. Matching on hardcoded user
 * ids would drift the moment the seed is regenerated. The environment that
 * runs those accounts is a Playwright run against a local/CI stack, and that
 * environment is already `NODE_ENV !== 'production'`, so it is excluded twice
 * over: by this flag when set, and by the non-production rule below regardless.
 */
export function isAnalyticsKillSwitched(): boolean {
  return isFlagOn(process.env.NEXT_PUBLIC_ANALYTICS_DISABLED)
}

/**
 * Whether analytics may run in this environment at all.
 *
 * Non-production is off by default so local dev and CI don't pollute the
 * funnels; set `NEXT_PUBLIC_ANALYTICS_ALLOW_NON_PRODUCTION=true` to opt a
 * staging/preview deployment back in.
 */
export function isAnalyticsEnvironmentEnabled(): boolean {
  if (isAnalyticsKillSwitched()) return false
  if (process.env.NODE_ENV === 'production') return true
  return isFlagOn(process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_NON_PRODUCTION)
}

/** Strip a leading `/en` or `/es` so path rules work on locale-prefixed routes. */
function stripLocale(path: string): string {
  return path.replace(/^\/(?:en|es)(?=\/|$)/, '') || '/'
}

/**
 * `/platform/*` is internal super-admin tooling, not product. Never tracked.
 */
export function isExcludedPath(path: string | null | undefined): boolean {
  if (!path) return false
  const withoutQuery = path.split('?')[0].split('#')[0]
  const normalized = stripLocale(withoutQuery)
  return normalized === '/platform' || normalized.startsWith('/platform/')
}

/**
 * The single predicate both transports call. `true` means: drop the event
 * silently, emit nothing, make no network call.
 */
export function shouldDropEvent(ctx: AnalyticsExclusionContext = {}): boolean {
  if (!isAnalyticsEnvironmentEnabled()) return true
  if (ctx.isSuperAdmin) return true
  if (ctx.isImpersonating) return true
  if (isExcludedPath(ctx.path)) return true
  return false
}
