/**
 * Each provider's REAL adapter against the REAL unified webhook route.
 *
 * `payment-webhook-route.test.ts` mocks `getPaymentProvider` wholesale, so it
 * proves the route's plumbing (claim, dedupe, ack shape) and nothing about any
 * provider: no test wired a real adapter to the real route, which left the line
 * where a signed event becomes course access unproven for every rail except
 * Stripe.
 *
 * Here only the NETWORK boundary is stubbed — `fetch`, for the two providers
 * that reach out during verification — plus Supabase. Signature verification,
 * normalization and the route are the shipping code:
 *
 *   - Lemon Squeezy signs with HMAC-SHA256 over the raw body, so the test signs
 *     for real with a secret it owns. Nothing is stubbed at all.
 *   - Binance Pay verifies RSA-SHA256 over `timestamp\nnonce\nbody\n` against a
 *     certificate fetched from Binance. The test generates its own keypair,
 *     serves the public half through the stubbed cert call, and signs the exact
 *     string the adapter reconstructs — so a change to that construction fails
 *     here.
 *   - PayPal delegates verification to PayPal's own API, so that ONE call is
 *     stubbed; the test asserts the request we send carries the five
 *     transmission headers PayPal needs, and that a non-SUCCESS verdict is
 *     refused.
 *
 * What this file deliberately does NOT prove: that the provider's live payload
 * still looks like these fixtures. Only a sandbox account proves that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'
import type { NextRequest } from 'next/server'

const LS_SECRET = 'ls_whsec_for_tests'

// Credentials only have to exist — getPaymentProvider refuses to construct an
// adapter without them, and nothing here calls a provider API for real.
process.env.LEMONSQUEEZY_API_KEY = 'ls_test_key'
process.env.LEMONSQUEEZY_STORE_ID = '1'
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = LS_SECRET
process.env.BINANCE_PAY_API_KEY = 'binance_test_key'
process.env.BINANCE_PAY_API_SECRET = 'binance_test_secret'
process.env.PAYPAL_CLIENT_ID = 'paypal_test_client'
process.env.PAYPAL_CLIENT_SECRET = 'paypal_test_secret'
process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST-ID'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_test_key'

const state = vi.hoisted(() => ({
  claimStatus: 'claimed' as 'claimed' | 'processing' | 'completed',
  dispatched: [] as Record<string, unknown>[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (name: string) => {
      if (name === 'claim_webhook_event') {
        return Promise.resolve({
          data: [
            {
              event_id: '00000000-0000-0000-0000-0000000006aa',
              claim_status: state.claimStatus,
              current_attempt_count: 1,
            },
          ],
          error: null,
        })
      }
      return Promise.resolve({ data: true, error: null })
    },
  }),
}))

vi.mock('@/lib/payments/webhook-dispatch', () => ({
  dispatchBillingEvent: (event: Record<string, unknown>) => {
    state.dispatched.push(event)
    return Promise.resolve()
  },
}))

// Imported after the mocks so the route picks them up; the providers are real.
const { POST } = await import('@/app/api/payments/webhook/[provider]/route')

function post(provider: string, body: string, headers: Record<string, string>) {
  const req = {
    text: () => Promise.resolve(body),
    headers: {
      forEach: (fn: (value: string, key: string) => void) => {
        Object.entries(headers).forEach(([k, v]) => fn(v, k))
      },
    },
  } as unknown as NextRequest
  return POST(req, { params: Promise.resolve({ provider }) })
}

/** The one dispatched event, failing loudly when the route dispatched none. */
function onlyDispatched() {
  expect(state.dispatched).toHaveLength(1)
  return state.dispatched[0]
}

beforeEach(() => {
  state.claimStatus = 'claimed'
  state.dispatched = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* ------------------------------------------------------------------ *
 * Lemon Squeezy — nothing stubbed, real HMAC end to end.
 * ------------------------------------------------------------------ */
describe('lemonsqueezy webhooks through the unified route', () => {
  const lsBody = (eventName: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      meta: {
        event_name: eventName,
        custom_data: { reference: '4242', userId: 'user-1', tenantId: 'tenant-1' },
      },
      data: {
        id: 'ls-sub-99',
        attributes: {
          updated_at: '2026-09-13T20:00:00.000Z',
          renews_at: '2026-10-13T20:00:00.000Z',
          ...extra,
        },
      },
    })

  const sign = (body: string) =>
    crypto.createHmac('sha256', LS_SECRET).update(body).digest('hex')

  it('settles a subscription activation and carries the buyer metadata', async () => {
    const body = lsBody('subscription_created')
    const res = await post('lemonsqueezy', body, { 'x-signature': sign(body) })

    expect(res.status).toBe(200)
    const event = onlyDispatched()
    expect(event.type).toBe('subscription.activated')
    expect(event.reference).toBe('4242')
    expect(event.providerSubscriptionId).toBe('ls-sub-99')
    // The binding that stops a signed event activating someone else's row.
    expect(event.metadata).toMatchObject({ userId: 'user-1', tenantId: 'tenant-1' })
  })

  it('refuses a body edited after signing', async () => {
    const body = lsBody('subscription_created')
    const signature = sign(body)
    const tampered = body.replace('"reference":"4242"', '"reference":"9999"')

    const res = await post('lemonsqueezy', tampered, { 'x-signature': signature })

    expect(res.status).toBe(400)
    expect(state.dispatched).toHaveLength(0)
  })

  it('refuses an unsigned body', async () => {
    const body = lsBody('subscription_created')
    const res = await post('lemonsqueezy', body, {})

    expect(res.status).toBe(400)
    expect(state.dispatched).toHaveLength(0)
  })

  it('gives two renewals distinct idempotency keys', async () => {
    const first = lsBody('subscription_payment_success', {
      subscription_id: 'ls-sub-99',
      updated_at: '2026-09-13T20:00:00.000Z',
    })
    const second = lsBody('subscription_payment_success', {
      subscription_id: 'ls-sub-99',
      updated_at: '2026-10-13T20:00:00.000Z',
    })

    await post('lemonsqueezy', first, { 'x-signature': sign(first) })
    await post('lemonsqueezy', second, { 'x-signature': sign(second) })

    expect(state.dispatched).toHaveLength(2)
    const [a, b] = state.dispatched
    expect(a.type).toBe('subscription.renewed')
    // Same subscription, different events: collapsing these would silently drop
    // a renewal the school was paid for.
    expect(a.providerEventId).not.toBe(b.providerEventId)
  })

  it('acknowledges an event type we do not model instead of retrying forever', async () => {
    const body = lsBody('license_key_created')
    const res = await post('lemonsqueezy', body, { 'x-signature': sign(body) })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ignored: true })
    expect(state.dispatched).toHaveLength(0)
  })

  it('reports a replayed event as a duplicate without dispatching twice', async () => {
    state.claimStatus = 'completed'
    const body = lsBody('subscription_created')

    const res = await post('lemonsqueezy', body, { 'x-signature': sign(body) })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ duplicate: true })
    expect(state.dispatched).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ *
 * Binance Pay — real RSA, only the certificate fetch stubbed.
 * ------------------------------------------------------------------ */
describe('binance pay webhooks through the unified route', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  /** Binance's certificate endpoint, and nothing else. */
  function stubCertFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('/binancepay/openapi/certificates')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({ status: 'SUCCESS', data: [{ certPublic: publicKey }] }),
            text: () => Promise.resolve(''),
          })
        }
        throw new Error(`unexpected fetch in test: ${url}`)
      }),
    )
  }

  const binanceBody = (bizStatus: string) =>
    JSON.stringify({
      bizType: 'PAY',
      bizId: 9825382937292,
      bizStatus,
      data: JSON.stringify({
        merchantTradeNo: 'tx4242',
        totalFee: '25.50',
        currency: 'USDT',
        transactionId: 'binance-tx-1',
      }),
    })

  function signed(body: string) {
    const timestamp = String(Date.now())
    const nonce = 'nonce0000000000000000000000000000'
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(`${timestamp}\n${nonce}\n${body}\n`)
      .sign(privateKey, 'base64')
    return {
      'binancepay-timestamp': timestamp,
      'binancepay-nonce': nonce,
      'binancepay-signature': signature,
    }
  }

  it('settles a successful pay event and acks in the shape Binance requires', async () => {
    stubCertFetch()
    const body = binanceBody('PAY_SUCCESS')

    const res = await post('binance', body, signed(body))

    expect(res.status).toBe(200)
    // Anything but this and Binance keeps retrying, then flags the webhook.
    await expect(res.json()).resolves.toMatchObject({ returnCode: 'SUCCESS' })
    const event = onlyDispatched()
    expect(event.reference).toBe('tx4242')
  })

  it('refuses a body edited after signing', async () => {
    stubCertFetch()
    const body = binanceBody('PAY_SUCCESS')
    const headers = signed(body)
    const tampered = body.replace('25.50', '0.01')

    const res = await post('binance', tampered, headers)

    expect(res.status).toBe(400)
    expect(state.dispatched).toHaveLength(0)
  })

  it('refuses a body signed with the wrong key', async () => {
    stubCertFetch()
    const body = binanceBody('PAY_SUCCESS')
    const other = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const timestamp = String(Date.now())
    const nonce = 'nonce0000000000000000000000000000'
    const signature = crypto
      .createSign('RSA-SHA256')
      .update(`${timestamp}\n${nonce}\n${body}\n`)
      .sign(other.privateKey, 'base64')

    const res = await post('binance', body, {
      'binancepay-timestamp': timestamp,
      'binancepay-nonce': nonce,
      'binancepay-signature': signature,
    })

    expect(res.status).toBe(400)
    expect(state.dispatched).toHaveLength(0)
  })

  it('refuses when the certificate cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('binance unreachable'))),
    )
    const body = binanceBody('PAY_SUCCESS')

    const res = await post('binance', body, signed(body))

    // Fail closed: an unverifiable event must never settle a sale.
    expect(res.status).toBe(400)
    expect(state.dispatched).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ *
 * PayPal — verification lives at PayPal, so that one call is stubbed.
 * ------------------------------------------------------------------ */
describe('paypal webhooks through the unified route', () => {
  const paypalHeaders = {
    'paypal-transmission-id': 'transmission-1',
    'paypal-transmission-time': '2026-09-13T20:00:00Z',
    'paypal-transmission-sig': 'sig-1',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/cert.pem',
    'paypal-auth-algo': 'SHA256withRSA',
  }

  const captureBody = JSON.stringify({
    id: 'WH-TEST-EVENT-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'capture-1',
      custom_id: '4242',
      amount: { value: '25.50', currency_code: 'USD' },
    },
  })

  /** Token + verify-webhook-signature, recording what we sent PayPal. */
  function stubPaypal(verificationStatus: string) {
    const calls: { url: string; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const target = String(url)
        if (target.includes('/v1/oauth2/token')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ access_token: 'token-1', expires_in: 3600 }),
            text: () => Promise.resolve(''),
          })
        }
        if (target.includes('/v1/notifications/verify-webhook-signature')) {
          calls.push({ url: target, body: JSON.parse(String(init?.body ?? '{}')) })
          // `api()` reads text() and parses it — json() is never called here.
          const payload = JSON.stringify({ verification_status: verificationStatus })
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(JSON.parse(payload)),
            text: () => Promise.resolve(payload),
          })
        }
        throw new Error(`unexpected fetch in test: ${target}`)
      }),
    )
    return calls
  }

  it('settles a completed capture and keeps our reference from custom_id', async () => {
    const calls = stubPaypal('SUCCESS')

    const res = await post('paypal', captureBody, paypalHeaders)

    expect(res.status).toBe(200)
    const event = onlyDispatched()
    expect(event.type).toBe('payment.succeeded')
    expect(event.reference).toBe('4242')
    expect(event.providerEventId).toBe('WH-TEST-EVENT-1')

    // PayPal rejects a verification request missing any of these, which would
    // fail closed in production while passing a test that never looked.
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toMatchObject({
      webhook_id: 'WH-TEST-ID',
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api.sandbox.paypal.com/cert.pem',
      transmission_id: 'transmission-1',
      transmission_sig: 'sig-1',
      transmission_time: '2026-09-13T20:00:00Z',
    })
  })

  it('refuses an event PayPal does not vouch for', async () => {
    stubPaypal('FAILURE')

    const res = await post('paypal', captureBody, paypalHeaders)

    expect(res.status).toBe(400)
    expect(state.dispatched).toHaveLength(0)
  })

  it('refuses an event with the transmission headers stripped', async () => {
    stubPaypal('SUCCESS')

    const res = await post('paypal', captureBody, {})

    // No call to PayPal at all — the adapter fails closed before asking.
    expect(res.status).toBe(400)
    expect(state.dispatched).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ *
 * Route-level guards that hold for every rail.
 * ------------------------------------------------------------------ */
describe('unified webhook route guards', () => {
  it('404s a provider that is not on the student allowlist', async () => {
    // `manual` and `solana` settle through their own routes; exposing them here
    // would accept an event nothing verifies.
    for (const provider of ['manual', 'solana', 'solana_subs', 'binance_personal']) {
      const res = await post(provider, '{}', {})
      expect(res.status, `${provider} must not be accepted here`).toBe(404)
    }
    expect(state.dispatched).toHaveLength(0)
  })
})
