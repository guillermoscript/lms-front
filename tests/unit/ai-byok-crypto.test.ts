import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// `server-only` is a Next-bundler shim (no installed package); stub it for vitest.
vi.mock('server-only', () => ({}))

import {
  encryptKey,
  decryptKey,
  needsReencrypt,
  getActiveKeyVersion,
  ByokCryptoError,
} from '@/lib/ai/byok/crypto'

const K1 = Buffer.alloc(32, 1).toString('base64')
const K2 = Buffer.alloc(32, 2).toString('base64')
const T1 = '00000000-0000-0000-0000-000000000001'
const T2 = '00000000-0000-0000-0000-000000000002'
const SECRET = 'sk-test-abcdefghijklmnopqrstuvwxyz0123456789'

const ENV_KEYS = ['AI_KEYS_ENCRYPTION_KEYS', 'AI_KEYS_ACTIVE_VERSION'] as const
const saved: Record<string, string | undefined> = {}

function setEnv(keys: Record<string, string> | string | undefined, active: string | undefined) {
  if (keys === undefined) delete process.env.AI_KEYS_ENCRYPTION_KEYS
  else process.env.AI_KEYS_ENCRYPTION_KEYS = typeof keys === 'string' ? keys : JSON.stringify(keys)
  if (active === undefined) delete process.env.AI_KEYS_ACTIVE_VERSION
  else process.env.AI_KEYS_ACTIVE_VERSION = active
}

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof ByokCryptoError ? e.code : `other:${(e as Error).message}`
  }
  return undefined
}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  setEnv({ '1': K1 }, '1')
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('byok crypto', () => {
  const ctx = { tenantId: T1, provider: 'openai' }

  it('round-trips and uses the v<N>:iv:tag:ct envelope', () => {
    const env = encryptKey(SECRET, ctx)
    expect(env).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/)
    expect(env).not.toContain(SECRET)
    expect(decryptKey(env, ctx)).toBe(SECRET)
  })

  it('uses a fresh IV each time', () => {
    expect(encryptKey(SECRET, ctx)).not.toBe(encryptKey(SECRET, ctx))
  })

  it('handles unicode and long values', () => {
    const v = 'k-ñ-' + 'x'.repeat(500)
    expect(decryptKey(encryptKey(v, ctx), ctx)).toBe(v)
  })

  it('rejects the wrong tenant (AAD)', () => {
    const env = encryptKey(SECRET, ctx)
    expect(code(() => decryptKey(env, { ...ctx, tenantId: T2 }))).toBe('decrypt_failed')
  })

  it('rejects the wrong provider (AAD)', () => {
    const env = encryptKey(SECRET, ctx)
    expect(code(() => decryptKey(env, { ...ctx, provider: 'anthropic' }))).toBe('decrypt_failed')
  })

  it('rejects tampering with ct, tag or iv', () => {
    const [v, iv, tag, ct] = encryptKey(SECRET, ctx).split(':')
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1)
    for (const bad of [`${v}:${iv}:${tag}:${flip(ct)}`, `${v}:${iv}:${flip(tag)}:${ct}`, `${v}:${flip(iv)}:${tag}:${ct}`]) {
      expect(code(() => decryptKey(bad, ctx))).toBe('decrypt_failed')
    }
  })

  it('rejects a swapped version label (key mismatch)', () => {
    setEnv({ '1': K1, '2': K2 }, '1')
    const env = encryptKey(SECRET, ctx)
    expect(code(() => decryptKey(env.replace(/^v1/, 'v2'), ctx))).toBe('decrypt_failed')
  })

  it('rejects malformed envelopes', () => {
    for (const bad of ['', 'garbage', 'v1:a:b', 'x1:AAAA:AAAA:AAAA', 'v1:AAAA:AAAA:AAAA', 'v0:AAAA:AAAA:AAAA']) {
      expect(code(() => decryptKey(bad, ctx))).toBe('bad_envelope')
    }
  })

  it('requires tenantId and provider', () => {
    expect(code(() => encryptKey(SECRET, { tenantId: '', provider: 'openai' }))).toBe('bad_context')
    expect(code(() => encryptKey(SECRET, { tenantId: T1, provider: '' }))).toBe('bad_context')
    expect(code(() => encryptKey('', ctx))).toBe('bad_context')
  })

  describe('rotation', () => {
    it('decrypts old versions after the active version moves; needsReencrypt flips', () => {
      const old = encryptKey(SECRET, ctx)
      expect(needsReencrypt(old)).toBe(false)

      setEnv({ '1': K1, '2': K2 }, '2')
      expect(getActiveKeyVersion()).toBe(2)
      expect(needsReencrypt(old)).toBe(true)
      expect(decryptKey(old, ctx)).toBe(SECRET)

      const fresh = encryptKey(decryptKey(old, ctx), ctx)
      expect(fresh.startsWith('v2:')).toBe(true)
      expect(needsReencrypt(fresh)).toBe(false)
      expect(decryptKey(fresh, ctx)).toBe(SECRET)
    })

    it('fails with unknown_version once the old master key is dropped', () => {
      const old = encryptKey(SECRET, ctx)
      setEnv({ '2': K2 }, '2')
      expect(code(() => decryptKey(old, ctx))).toBe('unknown_version')
    })
  })

  describe('fails closed on bad configuration', () => {
    it.each([
      ['keys unset', undefined, '1', 'config_missing'],
      ['active unset', { '1': K1 }, undefined, 'config_missing'],
      ['keys not JSON', 'nope', '1', 'config_invalid'],
      ['keys is an array', '[]', '1', 'config_invalid'],
      ['empty map', {}, '1', 'config_invalid'],
      ['active not in map', { '1': K1 }, '2', 'config_invalid'],
      ['active not an integer', { '1': K1 }, 'abc', 'config_invalid'],
      ['key too short', { '1': Buffer.alloc(16, 1).toString('base64') }, '1', 'config_invalid'],
      ['key too long', { '1': Buffer.alloc(64, 1).toString('base64') }, '1', 'config_invalid'],
      ['key not a string', '{"1":123}', '1', 'config_invalid'],
      ['bad version label', { x: K1 }, '1', 'config_invalid'],
    ])('%s', (_n, keys, active, expected) => {
      setEnv(keys as Record<string, string> | string | undefined, active as string | undefined)
      expect(code(() => encryptKey(SECRET, ctx))).toBe(expected)
      expect(code(() => needsReencrypt('v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAA'))).toBe(expected)
    })

    it('errors never leak key material or plaintext', () => {
      setEnv({ '1': Buffer.alloc(16, 7).toString('base64') }, '1')
      try {
        encryptKey(SECRET, ctx)
      } catch (e) {
        const m = (e as Error).message
        expect(m).not.toContain(SECRET)
        expect(m).not.toContain(Buffer.alloc(16, 7).toString('base64'))
      }
    })
  })
})
