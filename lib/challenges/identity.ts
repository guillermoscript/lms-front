import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'

/** httpOnly cookie carrying the raw guest token. Only its hash is stored. */
export const GUEST_COOKIE = 'reto_guest'
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function secret(): string {
  const value = process.env.CHALLENGE_HASH_SECRET || process.env.CRON_SECRET
  if (!value) throw new Error('CHALLENGE_HASH_SECRET is not set')
  return value
}

/** Keyed hash so a leaked table cannot be used to forge a guest cookie or reverse an IP. */
export function hashWithSecret(purpose: 'guest' | 'ip', value: string): string {
  return createHmac('sha256', secret()).update(`${purpose}:${value}`).digest('hex')
}

export function newGuestToken(): string {
  return randomBytes(32).toString('base64url')
}
