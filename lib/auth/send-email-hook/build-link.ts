import { locales, type Locale } from '@/i18n'
import { getSafeNextPath } from '@/lib/auth/safe-next-path'

const CONFIRM_PATH = '/auth/confirm'

export interface AuthEmailLink {
  /** The `token_hash`-based verification link, pointed at this app's own `/auth/confirm` route. */
  url: string
  /** A locale found in `redirect_to`'s path, if any — a signal for which language to write the email in. */
  locale: Locale | null
}

function localeFromPath(pathname: string): Locale | null {
  const first = pathname.split('/').filter(Boolean)[0]
  return (locales as readonly string[]).includes(first) ? (first as Locale) : null
}

/**
 * Build the branded email's call-to-action link.
 *
 * This app already has its own OTP-verification route,
 * `app/[locale]/auth/confirm/route.ts` — not Supabase's hosted
 * `/auth/v1/verify` — which calls `supabase.auth.verifyOtp({ type, token_hash })`
 * itself and then redirects to a `next` path. Once the Send Email hook is
 * enabled, GoTrue never builds a `ConfirmationURL`; we build this link
 * ourselves, so it always targets `/auth/confirm` directly.
 *
 * `redirect_to` — not `email_data.site_url`, which is only the project's
 * global Site URL setting — carries the tenant: every call site builds it
 * from `window.location.origin`, i.e. the subdomain the visitor was actually
 * on (`components/sign-up-form.tsx`, `components/forgot-password-form.tsx`).
 * Its path becomes `next`: unwrapped one level when it already points at
 * `/auth/confirm` itself (the sign-up flow's own `emailRedirectTo`), so
 * clicking the link doesn't bounce through that route twice.
 */
export function buildAuthEmailLink(params: {
  siteUrl: string
  redirectTo: string | null
  tokenHash: string
  type: string
}): AuthEmailLink {
  let origin = params.siteUrl
  let next = '/'
  let locale: Locale | null = null

  if (params.redirectTo) {
    try {
      const target = new URL(params.redirectTo)
      origin = target.origin
      locale = localeFromPath(target.pathname)

      next =
        target.pathname === CONFIRM_PATH || target.pathname.endsWith(`/${CONFIRM_PATH.slice(1)}`)
          ? getSafeNextPath(target.searchParams.get('next'), '/')
          : getSafeNextPath(target.pathname + target.search, '/')
    } catch {
      // Malformed redirect_to — fall back to site_url + '/'.
    }
  }

  const link = new URL(CONFIRM_PATH, origin)
  link.searchParams.set('token_hash', params.tokenHash)
  link.searchParams.set('type', params.type)
  link.searchParams.set('next', next)

  return { url: link.toString(), locale }
}
