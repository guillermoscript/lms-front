import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { LemonSqueezyProvider } from '@/lib/payments/lemonsqueezy-provider'

/**
 * Lemon Squeezy webhook signature verification. The provider constructor takes
 * (apiKey, storeId, webhookSecret) directly, so verifyWebhook is a pure function
 * of (rawBody, headers) + the injected secret — no network or env required.
 *
 * Secret is a clearly fake literal; never use a real secret here.
 */
const TEST_SECRET = 'test_secret_not_real'

function sign(body: string, secret = TEST_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

describe('LemonSqueezyProvider.verifyWebhook', () => {
  const provider = new LemonSqueezyProvider('test_key', 'test_store', TEST_SECRET)
  const body = JSON.stringify({ meta: { event_name: 'subscription_created' }, data: {} })

  it('returns true for a correct HMAC-SHA256 signature (lowercase header)', async () => {
    const ok = await provider.verifyWebhook(body, { 'x-signature': sign(body) })
    expect(ok).toBe(true)
  })

  it('accepts the capitalized X-Signature header form', async () => {
    const ok = await provider.verifyWebhook(body, { 'X-Signature': sign(body) })
    expect(ok).toBe(true)
  })

  it('returns false for a tampered signature', async () => {
    const sig = sign(body)
    const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0')
    const ok = await provider.verifyWebhook(body, { 'x-signature': tampered })
    expect(ok).toBe(false)
  })

  it('returns false when the body is tampered (signature no longer matches)', async () => {
    const sig = sign(body)
    const ok = await provider.verifyWebhook(body + ' ', { 'x-signature': sig })
    expect(ok).toBe(false)
  })

  it('returns false for a signature made with a different secret', async () => {
    const ok = await provider.verifyWebhook(body, { 'x-signature': sign(body, 'other_secret') })
    expect(ok).toBe(false)
  })

  it('returns false when the signature header is missing', async () => {
    const ok = await provider.verifyWebhook(body, {})
    expect(ok).toBe(false)
  })

  it('returns false (no throw) for a length-mismatched signature', async () => {
    // timingSafeEqual throws on differing buffer lengths; verifyWebhook guards it.
    const ok = await provider.verifyWebhook(body, { 'x-signature': 'deadbeef' })
    expect(ok).toBe(false)
  })

  it('returns false when no secret is configured', async () => {
    const noSecret = new LemonSqueezyProvider('test_key', 'test_store', '')
    const prev = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
    delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET
    try {
      const ok = await noSecret.verifyWebhook(body, { 'x-signature': sign(body) })
      expect(ok).toBe(false)
    } finally {
      if (prev !== undefined) process.env.LEMONSQUEEZY_WEBHOOK_SECRET = prev
    }
  })
})
