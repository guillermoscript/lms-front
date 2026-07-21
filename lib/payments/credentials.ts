/**
 * Encrypted-at-rest per-tenant payment credentials (issue #482).
 *
 * Some providers need per-tenant API secrets (e.g. binance_personal reads the
 * school's own read-only Binance API key). Those live in
 * `tenant_payment_wallets.credentials` (jsonb) — a column explicitly reserved
 * for encrypted material — with every sensitive value encrypted app-side so a
 * DB dump, a leaked admin session, or the RLS-scoped settings UI never sees
 * plaintext. Same AES-256-GCM scheme as lib/certificates/crypto.ts.
 *
 * Storage format per value: `iv:authTag:ciphertext` (hex, colon-delimited).
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

/** Master key for payment credentials. Fails closed when unset. */
export function getPaymentCredentialsKey(): string {
  const key = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY
  if (!key) {
    throw new Error('PAYMENT_CREDENTIALS_ENCRYPTION_KEY environment variable is not set')
  }
  return key
}

/** Derive a 32-byte key from the env string (same derivation as certificates). */
function deriveKey(encryptionKey: string): Buffer {
  return crypto.createHash('sha256').update(encryptionKey).digest()
}

export function encryptCredential(plaintext: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(encryptionKey), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptCredential(encryptedData: string, encryptionKey: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':')
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted credential format')
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(encryptionKey), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8')
}
