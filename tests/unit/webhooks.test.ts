import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  PLATFORM_WEBHOOK_EVENTS, SCHOOL_WEBHOOK_EVENTS, PLATFORM_ONLY_WEBHOOK_EVENTS, normalizeSubscribedEvents,
} from '@/lib/webhooks/events'
import { generateWebhookSecret, maskSecret, signWebhookPayload, verifyWebhookSignature } from '@/lib/webhooks/signing'
import { isPrivateIp, parseWebhookUrl } from '@/lib/webhooks/url-guard'
import { parseEndpointInput } from '@/lib/webhooks/input'
import {
  MAX_ATTEMPTS, RETRY_DELAYS_SECONDS, nextRetryDelaySeconds, postSigned,
} from '@/lib/webhooks/deliver'

describe('event catalog', () => {
  it('platform = school + platform-only, no duplicates', () => {
    expect(new Set(PLATFORM_WEBHOOK_EVENTS).size).toBe(PLATFORM_WEBHOOK_EVENTS.length)
    expect(PLATFORM_WEBHOOK_EVENTS).toEqual([...SCHOOL_WEBHOOK_EVENTS, ...PLATFORM_ONLY_WEBHOOK_EVENTS])
  })

  it('every event type is emitted by the migration', async () => {
    const { readFileSync, readdirSync } = await import('fs')
    const files = readdirSync('supabase/migrations').filter((f) => /outbound_webhooks.*\.sql$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    const sql = files.map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
    for (const ev of PLATFORM_WEBHOOK_EVENTS) expect(sql).toContain(`'${ev}'`)
  })

  it('school scope rejects platform-only events and unknowns', () => {
    expect(normalizeSubscribedEvents('school', ['school.created'])).toBeNull()
    expect(normalizeSubscribedEvents('school', ['nope'])).toBeNull()
    expect(normalizeSubscribedEvents('school', [])).toBeNull()
    expect(normalizeSubscribedEvents('platform', ['school.created'])).toEqual(['school.created'])
  })

  it('wildcard collapses and duplicates dedupe', () => {
    expect(normalizeSubscribedEvents('school', ['member.joined', '*'])).toEqual(['*'])
    expect(normalizeSubscribedEvents('school', ['member.joined', 'member.joined'])).toEqual(['member.joined'])
  })
})

describe('signing', () => {
  it('round-trips and rejects tampering and stale timestamps', () => {
    const secret = generateWebhookSecret()
    expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/)
    const body = '{"a":1}'
    const sig = signWebhookPayload(secret, 1_700_000_000, body)
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/)
    expect(verifyWebhookSignature(secret, 1_700_000_000, body, sig, 300, 1_700_000_100)).toBe(true)
    expect(verifyWebhookSignature(secret, 1_700_000_000, '{"a":2}', sig, 300, 1_700_000_100)).toBe(false)
    expect(verifyWebhookSignature(secret, 1_700_000_000, body, sig, 300, 1_700_001_000)).toBe(false)
    expect(verifyWebhookSignature('whsec_other', 1_700_000_000, body, sig, 300, 1_700_000_100)).toBe(false)
  })

  it('mask never reveals more than 4 chars', () => {
    expect(maskSecret('whsec_abcdef1234')).toBe('whsec_••••1234')
  })
})

describe('url guard', () => {
  const orig = process.env.NODE_ENV
  afterEach(() => { vi.stubEnv('NODE_ENV', orig as string) })

  it.each(['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '172.31.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])(
    'blocks private %s', (ip) => expect(isPrivateIp(ip)).toBe(true))

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111'])('allows public %s', (ip) => expect(isPrivateIp(ip)).toBe(false))

  it('production: https public only', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(parseWebhookUrl('https://n8n.example.com/webhook/abc').ok).toBe(true)
    expect(parseWebhookUrl('http://n8n.example.com/x')).toEqual({ ok: false, reason: 'insecure_url' })
    expect(parseWebhookUrl('https://localhost/x')).toEqual({ ok: false, reason: 'blocked_host' })
    expect(parseWebhookUrl('http://localhost:5678/x')).toEqual({ ok: false, reason: 'insecure_url' })
    expect(parseWebhookUrl('https://169.254.169.254/latest')).toEqual({ ok: false, reason: 'blocked_host' })
    expect(parseWebhookUrl('https://db.internal/x')).toEqual({ ok: false, reason: 'blocked_host' })
    expect(parseWebhookUrl('https://redis/x')).toEqual({ ok: false, reason: 'blocked_host' })
    expect(parseWebhookUrl('https://user:pw@example.com/x')).toEqual({ ok: false, reason: 'invalid_url' })
    expect(parseWebhookUrl('not a url')).toEqual({ ok: false, reason: 'invalid_url' })
    expect(parseWebhookUrl('ftp://example.com')).toEqual({ ok: false, reason: 'insecure_url' })
  })

  it('development allows local n8n', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(parseWebhookUrl('http://localhost:5678/webhook/x').ok).toBe(true)
  })
})

describe('endpoint input', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'))

  it('accepts a valid school endpoint', () => {
    const r = parseEndpointInput('school', { name: ' n8n ', url: 'https://n8n.example.com/w', events: ['member.joined'] })
    expect(r).toEqual({ ok: true, value: { name: 'n8n', url: 'https://n8n.example.com/w', events: ['member.joined'] } })
  })

  it('reports every bad field', () => {
    const r = parseEndpointInput('school', { name: '', url: 'http://x.com', events: ['school.created'] })
    expect(r).toMatchObject({ ok: false, fields: ['name', 'url', 'events'], reason: 'insecure_url' })
  })
})

describe('retry schedule + delivery', () => {
  it('backs off then gives up after MAX_ATTEMPTS', () => {
    expect(MAX_ATTEMPTS).toBe(RETRY_DELAYS_SECONDS.length + 1)
    expect(nextRetryDelaySeconds(1)).toBe(60)
    expect(nextRetryDelaySeconds(MAX_ATTEMPTS - 1)).toBe(RETRY_DELAYS_SECONDS.at(-1))
    expect(nextRetryDelaySeconds(MAX_ATTEMPTS)).toBeNull()
  })

  it('postSigned sends signed headers, no redirects, and maps statuses', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const calls: { url: string; init: RequestInit }[] = []
    const mk = (status: number) => (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! })
      return new Response('ok', { status })
    }) as unknown as typeof fetch
    const delivery = { id: 'd1', event_id: 'e1', event_type: 'member.joined', payload: { id: 'e1' } }
    const ep = { url: 'http://localhost:5678/hook', secret: 'whsec_x' }

    expect(await postSigned(ep, delivery, mk(200))).toEqual({ ok: true, statusCode: 200, error: null })
    const h = calls[0].init.headers as Record<string, string>
    expect(calls[0].init.redirect).toBe('manual')
    expect(h['X-Webhook-Event']).toBe('member.joined')
    const ts = Number(h['X-Webhook-Timestamp'])
    expect(verifyWebhookSignature('whsec_x', ts, JSON.stringify(delivery.payload), h['X-Webhook-Signature'])).toBe(true)

    expect((await postSigned(ep, delivery, mk(500))).ok).toBe(false)
    expect(await postSigned(ep, delivery, mk(302))).toMatchObject({ ok: false, error: 'redirect not followed' })
    const boom = (async () => { throw new TypeError('x') }) as unknown as typeof fetch
    expect(await postSigned(ep, delivery, boom)).toEqual({ ok: false, statusCode: null, error: 'network error' })
  })

  it('refuses blocked targets without calling fetch', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const f = vi.fn()
    const r = await postSigned({ url: 'https://169.254.169.254/x', secret: 's' },
      { id: 'd', event_id: 'e', event_type: 't', payload: {} }, f as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})
