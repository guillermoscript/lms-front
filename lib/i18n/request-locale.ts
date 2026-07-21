import type { NextRequest } from 'next/server'
import { locales, defaultLocale, type Locale } from '@/i18n'

const supported = locales as readonly string[]

/**
 * Resolve the locale to use for a redirect URL built inside an API route.
 *
 * API routes don't run through next-intl, so they have no `[locale]` param.
 * Prefer an explicit locale from the request body (clients under `app/[locale]`
 * can pass `useLocale()`), then fall back to the first path segment of the
 * `referer` (the page the request came from), and finally the default locale.
 * Anything not in the supported set is ignored so a caller can't inject an
 * arbitrary path segment into the redirect URL.
 */
export function resolveRequestLocale(req: NextRequest, bodyLocale?: unknown): Locale {
  if (typeof bodyLocale === 'string' && supported.includes(bodyLocale)) {
    return bodyLocale as Locale
  }

  const referer = req.headers.get('referer')
  if (referer) {
    try {
      const seg = new URL(referer).pathname.split('/').filter(Boolean)[0]
      if (seg && supported.includes(seg)) return seg as Locale
    } catch {
      // malformed referer — ignore and fall through to the default
    }
  }

  return defaultLocale
}
