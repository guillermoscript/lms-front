import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** httpOnly cookie carrying the signed guest token. Only its hash is stored. */
export const GUEST_COOKIE = 'reto_guest'
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Fail closed: there is deliberately no fallback to another secret. */
function secret(): string {
  const value = process.env.CHALLENGE_HASH_SECRET
  if (!value) throw new Error('CHALLENGE_HASH_SECRET is not set')
  return value
}

export function isChallengeSecretConfigured(): boolean {
  return !!process.env.CHALLENGE_HASH_SECRET
}

function hmac(purpose: string, value: string): string {
  return createHmac('sha256', secret()).update(`${purpose}:${value}`).digest('hex')
}

/** Keyed hash so a leaked table cannot be used to forge a guest cookie or reverse an IP. */
export function hashWithSecret(purpose: 'guest' | 'ip', value: string): string {
  return hmac(purpose, value)
}

/** `<random>.<hmac>`: the server is the only party that can mint a valid one. */
export function newGuestToken(): string {
  const random = randomBytes(32).toString('base64url')
  return `${random}.${hmac('cookie', random)}`
}

/** True only for a token this server issued. An unsigned or tampered value is never trusted. */
export function verifyGuestToken(token: string | undefined | null): token is string {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(hmac('cookie', token.slice(0, dot)))
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Client IP as seen by our reverse proxy. The proxy APPENDS the address it saw
 * to X-Forwarded-For, so the LAST entry is the only one a client cannot choose;
 * the first is client-controlled. Assumes exactly one trusted proxy hop. No
 * header means 'unknown' (we do not fall back to other client-settable headers).
 */
export function trustedClientIp(headers: { get(name: string): string | null }): string {
  const parts = (headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? 'unknown'
}
