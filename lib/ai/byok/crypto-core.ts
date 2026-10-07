/**
 * Implementation of BYOK key encryption. DO NOT import this from app code:
 * import `@/lib/ai/byok/crypto` (which carries `import 'server-only'`). This
 * file exists separately only so `scripts/rotate-ai-keys.ts`, which runs under
 * tsx outside Next's bundler, can reuse the exact same code path.
 *
 * Scheme: AES-256-GCM, versioned master keys, AAD binds the ciphertext to its
 * tenant and provider so a row copied between tenants/providers fails to
 * decrypt (modeled on lib/payments/credentials.ts, hardened).
 *
 * Envelope: `v<N>:<iv>:<tag>:<ct>` (iv/tag/ct base64url, so no `:` inside).
 *
 * Env:
 *   AI_KEYS_ENCRYPTION_KEYS  JSON `{"1":"<base64 of 32 bytes>", "2":"..."}`
 *   AI_KEYS_ACTIVE_VERSION   integer, must exist in the map; used to encrypt
 *
 * Fails closed: any missing / malformed / wrong-length key throws. Error
 * messages never include key material or plaintext.
 */

import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

/** Mirrors ProviderId in lib/ai/providers.ts (kept as string to avoid importing @ai-sdk). */
export type ByokProviderId = string

export interface ByokCryptoContext {
  tenantId: string
  provider: ByokProviderId
}

export type ByokCryptoErrorCode =
  | 'config_missing'
  | 'config_invalid'
  | 'bad_context'
  | 'bad_envelope'
  | 'unknown_version'
  | 'decrypt_failed'

export class ByokCryptoError extends Error {
  readonly code: ByokCryptoErrorCode
  constructor(code: ByokCryptoErrorCode, message: string) {
    super(message)
    this.name = 'ByokCryptoError'
    this.code = code
  }
}

interface KeyRing {
  keys: Map<number, Buffer>
  active: number
}

function parseVersion(raw: string, what: string): number {
  if (!/^[1-9]\d{0,8}$/.test(raw)) {
    throw new ByokCryptoError('config_invalid', `${what} must be a positive integer`)
  }
  return Number(raw)
}

/** Parses env on every call (cheap; keeps tests and rotation simple). */
function loadKeyRing(): KeyRing {
  const rawKeys = process.env.AI_KEYS_ENCRYPTION_KEYS
  const rawActive = process.env.AI_KEYS_ACTIVE_VERSION
  if (!rawKeys) throw new ByokCryptoError('config_missing', 'AI_KEYS_ENCRYPTION_KEYS is not set')
  if (!rawActive) throw new ByokCryptoError('config_missing', 'AI_KEYS_ACTIVE_VERSION is not set')

  let parsed: unknown
  try {
    parsed = JSON.parse(rawKeys)
  } catch {
    throw new ByokCryptoError('config_invalid', 'AI_KEYS_ENCRYPTION_KEYS is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ByokCryptoError('config_invalid', 'AI_KEYS_ENCRYPTION_KEYS must be a JSON object')
  }

  const keys = new Map<number, Buffer>()
  for (const [ver, b64] of Object.entries(parsed as Record<string, unknown>)) {
    const version = parseVersion(ver, 'AI_KEYS_ENCRYPTION_KEYS version')
    if (typeof b64 !== 'string') {
      throw new ByokCryptoError('config_invalid', `Key v${version} must be a base64 string`)
    }
    const buf = Buffer.from(b64, 'base64')
    if (buf.length !== KEY_BYTES) {
      throw new ByokCryptoError('config_invalid', `Key v${version} must decode to ${KEY_BYTES} bytes`)
    }
    keys.set(version, buf)
  }
  if (keys.size === 0) {
    throw new ByokCryptoError('config_invalid', 'AI_KEYS_ENCRYPTION_KEYS has no keys')
  }

  const active = parseVersion(rawActive.trim(), 'AI_KEYS_ACTIVE_VERSION')
  if (!keys.has(active)) {
    throw new ByokCryptoError('config_invalid', `AI_KEYS_ACTIVE_VERSION v${active} is not in AI_KEYS_ENCRYPTION_KEYS`)
  }
  return { keys, active }
}

function aad(ctx: ByokCryptoContext): Buffer {
  if (!ctx || typeof ctx.tenantId !== 'string' || typeof ctx.provider !== 'string' || !ctx.tenantId || !ctx.provider) {
    throw new ByokCryptoError('bad_context', 'tenantId and provider are required')
  }
  return Buffer.from(`${ctx.tenantId}:${ctx.provider}`, 'utf8')
}

interface ParsedEnvelope {
  version: number
  iv: Buffer
  tag: Buffer
  ct: Buffer
}

const B64URL = /^[A-Za-z0-9_-]+$/

function parseEnvelope(envelope: string): ParsedEnvelope {
  if (typeof envelope !== 'string') throw new ByokCryptoError('bad_envelope', 'Invalid envelope')
  const parts = envelope.split(':')
  if (parts.length !== 4) throw new ByokCryptoError('bad_envelope', 'Invalid envelope')
  const [v, ivS, tagS, ctS] = parts
  const m = /^v([1-9]\d{0,8})$/.exec(v)
  if (!m || !B64URL.test(ivS) || !B64URL.test(tagS) || !B64URL.test(ctS)) {
    throw new ByokCryptoError('bad_envelope', 'Invalid envelope')
  }
  const iv = Buffer.from(ivS, 'base64url')
  const tag = Buffer.from(tagS, 'base64url')
  const ct = Buffer.from(ctS, 'base64url')
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ct.length === 0) {
    throw new ByokCryptoError('bad_envelope', 'Invalid envelope')
  }
  return { version: Number(m[1]), iv, tag, ct }
}

/** Encrypts with the ACTIVE key version, bound to tenant + provider. */
export function encryptKey(plain: string, ctx: ByokCryptoContext): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new ByokCryptoError('bad_context', 'Nothing to encrypt')
  }
  const ring = loadKeyRing()
  const additional = aad(ctx)
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, ring.keys.get(ring.active)!, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(additional)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v${ring.active}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ct.toString('base64url')}`
}

/** Decrypts with whichever version the envelope names. Throws on any tamper / wrong AAD. */
export function decryptKey(envelope: string, ctx: ByokCryptoContext): string {
  const parsed = parseEnvelope(envelope)
  const ring = loadKeyRing()
  const key = ring.keys.get(parsed.version)
  if (!key) throw new ByokCryptoError('unknown_version', `No master key for v${parsed.version}`)
  const additional = aad(ctx)
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, parsed.iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(additional)
    decipher.setAuthTag(parsed.tag)
    return Buffer.concat([decipher.update(parsed.ct), decipher.final()]).toString('utf8')
  } catch {
    // Deliberately generic: do not distinguish wrong key / wrong AAD / tamper.
    throw new ByokCryptoError('decrypt_failed', 'Could not decrypt credential')
  }
}

/** True when the envelope was written under a version other than the active one. */
export function needsReencrypt(envelope: string): boolean {
  const parsed = parseEnvelope(envelope)
  return parsed.version !== loadKeyRing().active
}

/** Active master-key version (for writing `key_version` alongside the ciphertext). */
export function getActiveKeyVersion(): number {
  return loadKeyRing().active
}

/** Version named by an envelope (the stored `key_version` should match). */
export function envelopeVersion(envelope: string): number {
  return parseEnvelope(envelope).version
}
