import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export const SIGNATURE_VERSION = 'v1'

/** `whsec_` + 32 random bytes (hex). Shown to the owner once. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('hex')}`
}

/** Last 4 chars only, for the list UI. */
export function maskSecret(secret: string): string {
  return `whsec_••••${secret.slice(-4)}`
}

/**
 * Signature over `${timestamp}.${body}` so a captured request cannot be replayed
 * with a fresh timestamp. Header value: `v1=<hex>`.
 */
export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `${SIGNATURE_VERSION}=${mac}`
}

/** Receiver-side check, exported for tests and the docs example. */
export function verifyWebhookSignature(
  secret: string,
  timestamp: number,
  body: string,
  header: string,
  toleranceSeconds = 300,
  now = Math.floor(Date.now() / 1000)
): boolean {
  if (Math.abs(now - timestamp) > toleranceSeconds) return false
  const expected = Buffer.from(signWebhookPayload(secret, timestamp, body))
  const given = Buffer.from(header)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
