import { randomBytes } from 'node:crypto'

/**
 * Invitation tokens are 64 hex chars (DB default: two dash-less v4 UUIDs;
 * rotation: 32 random bytes). Accept 32-128 to stay tolerant of either.
 */
const INVITE_TOKEN = /^[0-9a-f]{32,128}$/i

/** Normalise untrusted input to a token, or null. Never throws. */
export function parseInviteToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return INVITE_TOKEN.test(trimmed) ? trimmed.toLowerCase() : null
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('hex')
}

/** `<joinUrl>?invite=<token>` — the only link that can consume an invitation. */
export function withInviteToken(joinUrl: string, token: string): string {
  const url = new URL(joinUrl)
  url.searchParams.set('invite', token)
  return url.toString()
}
