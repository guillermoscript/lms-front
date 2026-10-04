import { getLocale } from 'next-intl/server'

/**
 * The request's locale, or `undefined` when there isn't one.
 *
 * `getLocale()` throws outside a request scope (a cron tick, a webhook, a
 * background job), and every caller wants the same thing there: the reader's
 * language when it is knowable, and no failure when it isn't. An unknown
 * locale is a missing analytics dimension or an English email — never a
 * failed action.
 *
 * Distinct from `resolveRequestLocale` in this directory, which digs a locale
 * out of an API route's body or referer because API routes never run through
 * next-intl at all.
 */
export async function bestEffortLocale(): Promise<string | undefined> {
  try {
    return await getLocale()
  } catch {
    return undefined
  }
}

/** Same, for callers that need a concrete locale to format or translate with. */
export async function bestEffortLocaleOr(fallback: string): Promise<string> {
  return (await bestEffortLocale()) ?? fallback
}
