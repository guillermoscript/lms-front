/**
 * Coarse, closed-set reason codes for the auth failure events (§9.2).
 *
 * WHY THIS EXISTS AT ALL: the obvious implementation of `login_failed` is to
 * pass `error.message` straight through. Three things go wrong when you do.
 *
 *   1. PII. GoTrue messages are not a fixed vocabulary, and several of them
 *      interpolate the address that was submitted. Passing the raw string
 *      through puts user email into the analytics store, permanently, via a
 *      code path nobody thinks of as handling personal data.
 *   2. Account enumeration. The distinction between "no such user" and "wrong
 *      password" is exactly the thing an auth system is supposed not to leak;
 *      it should not leak into a dashboard either. Both map to
 *      `invalid_credentials` here.
 *   3. Cardinality. Raw provider strings change between GoTrue releases and
 *      differ per provider, so "the same" failure splits into buckets that
 *      never sum. A closed set is the only version of this event that charts.
 *
 * The `/auth/error` page needs this too, and for a non-obvious reason: the URL
 * it reads is built by `app/[locale]/auth/confirm/route.ts`, which does
 * `redirect(\`/auth/error?error=${error?.message}\`)` — so that query parameter
 * is a raw GoTrue message wearing a query-parameter costume, not a code.
 *
 * Isomorphic on purpose: imported by client components AND by the server
 * component that renders the error page, so the two can never disagree.
 *
 * ADDING A CODE: add it to the union, then add its match above the fallback.
 * Never widen the return type to `string` — that reopens every hole above.
 */

export type AuthFailureCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_taken'
  | 'weak_password'
  | 'rate_limited'
  | 'name_required'
  | 'expired_or_invalid_link'
  | 'missing_token'
  | 'provider_error'
  | 'network_error'
  | 'unknown'

/** Lowercased needles → code. Order matters: first match wins. */
const PATTERNS: ReadonlyArray<readonly [readonly string[], AuthFailureCode]> = [
  [['already registered', 'already exists', 'already been registered'], 'email_taken'],
  [['email not confirmed', 'email address not confirmed', 'not confirmed'], 'email_not_confirmed'],
  [['invalid login', 'invalid credentials', 'invalid email or password', 'user not found'], 'invalid_credentials'],
  [['rate limit', 'too many', 'over_request_rate_limit', 'security purposes'], 'rate_limited'],
  // After the credential checks: "invalid password" would otherwise be caught
  // by the bare 'password' needle and misreported as a weak-password rejection.
  [['password should be', 'password must', 'weak password', 'password is too'], 'weak_password'],
  [['expired', 'token has expired', 'invalid token', 'otp_expired', 'token not found'], 'expired_or_invalid_link'],
  [['no token hash', 'missing token'], 'missing_token'],
  [['provider', 'oauth', 'could not authenticate'], 'provider_error'],
  [['fetch failed', 'network', 'failed to fetch'], 'network_error'],
]

/**
 * Map anything — an `Error`, a raw provider string, a URL query parameter — to
 * one of a small fixed set of codes. Never returns caller-supplied text.
 */
export function toAuthFailureCode(input: unknown): AuthFailureCode {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === 'string'
        ? input
        : ''

  if (!raw.trim()) return 'unknown'

  // Query parameters arrive `+`- or `%20`-encoded from the redirects that build
  // them; normalise before matching or every needle misses.
  const haystack = raw.replace(/\+/g, ' ').toLowerCase()

  for (const [needles, code] of PATTERNS) {
    if (needles.some((needle) => haystack.includes(needle))) return code
  }

  return 'unknown'
}
