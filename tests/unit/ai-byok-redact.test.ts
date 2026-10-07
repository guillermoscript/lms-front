import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { redact } from '@/lib/ai/byok/redact'

describe('redact', () => {
  it.each([
    ['openai', 'sk-proj-AbCdEf0123456789_xyz-ABC'],
    ['classic openai', 'sk-abcdefghijklmnopqrstuvwxyz012345'],
    ['anthropic', 'sk-ant-api03-AbCdEf0123456789_xyz-ABC'],
    ['openrouter', 'sk-or-v1-0123456789abcdef0123456789abcdef'],
    ['google', 'AIzaSyA-1234567890abcdefghijklmnopqrstu'],
    ['groq', 'gsk_AbCdEf0123456789AbCdEf0123456789'],
    ['xai', 'xai-AbCdEf0123456789AbCdEf0123456789'],
  ])('masks %s keys inside messages', (_n, key) => {
    const out = redact(`Incorrect API key provided: ${key}. Check your dashboard.`)
    expect(out).not.toContain(key)
    expect(out).toContain('[REDACTED]')
    expect(out).toContain('Check your dashboard.')
  })

  it('masks Bearer tokens', () => {
    const out = redact('Authorization: Bearer abcdef0123456789.token-value')
    expect(out).not.toContain('abcdef0123456789')
  })

  it('masks key=value and JSON credential fields, keeping the field name', () => {
    const a = redact('{"api_key":"0123456789abcdef0123456789abcdef","model":"x"}')
    expect(a).not.toContain('0123456789abcdef')
    expect(a).toContain('"api_key"')
    expect(a).toContain('"model":"x"')
    expect(redact('x-api-key: 0123456789abcdef0123')).not.toContain('0123456789abcdef')
  })

  it('masks key query params', () => {
    const out = redact('GET https://x.test/v1beta/models?key=AIzaSyA-1234567890abcdefghijk&alt=json')
    expect(out).not.toContain('AIzaSyA')
    expect(out).toContain('alt=json')
  })

  it('masks every occurrence', () => {
    const k = 'sk-abcdefghijklmnop'
    expect(redact(`${k} and ${k}`)).toBe('[REDACTED] and [REDACTED]')
  })

  it('leaves benign text untouched and tolerates empty / non-string input', () => {
    expect(redact('Request failed with status 429')).toBe('Request failed with status 429')
    expect(redact('')).toBe('')
    expect(redact(undefined as unknown as string)).toBe('')
  })
})
