/**
 * Slug rules for a school created on behalf of someone (#984).
 *
 * The `create_school` RPC and the self-serve flow only enforce uniqueness (the
 * client lowercases and dashes the name). A super admin typing a slug by hand
 * gets the stricter rule below: same shape the client produces, a DNS-label
 * length, and nothing that collides with a platform host. Uniqueness is I/O and
 * lives in `createSchoolOnBehalfCore`.
 *
 * Pure module: unit-testable, no server or browser APIs.
 */

export const SLUG_MIN_LENGTH = 3
export const SLUG_MAX_LENGTH = 63

/** Hosts `proxy.ts` treats as the platform itself, plus names that would read as platform infrastructure. */
export const RESERVED_SLUGS: readonly string[] = [
  'localhost',
  '127',
  'lvh',
  'www',
  'app',
  'api',
  'admin',
  'platform',
  'auth',
  'mail',
  'static',
  'assets',
  'cdn',
  'dashboard',
  'login',
  'signup',
  'support',
  'status',
  'docs',
  'blog',
  'help',
]

const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export type SlugValidation = { ok: true; slug: string } | { ok: false; error: string }

export function validateSchoolSlug(raw: unknown): SlugValidation {
  if (typeof raw !== 'string') return { ok: false, error: 'Slug is required' }
  const slug = raw.trim().toLowerCase()
  if (!slug) return { ok: false, error: 'Slug is required' }
  if (slug.length < SLUG_MIN_LENGTH) {
    return { ok: false, error: `Slug must be at least ${SLUG_MIN_LENGTH} characters` }
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return { ok: false, error: `Slug must be at most ${SLUG_MAX_LENGTH} characters` }
  }
  if (!SLUG_SHAPE.test(slug)) {
    return { ok: false, error: 'Use lowercase letters, numbers and single dashes (no leading or trailing dash)' }
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return { ok: false, error: 'This slug is reserved' }
  }
  return { ok: true, slug }
}

export const SLUG_TAKEN_MESSAGE = 'This school URL is already taken'
