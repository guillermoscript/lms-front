import crypto from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BinancePayProvider } from '@/lib/payments/binance-provider'
import { isLoopbackOrigin } from '@/lib/payments/loopback-origin'

/**
 * `BINANCE_PAY_API_BASE` (#952): the loopback-only seam that lets an E2E serve
 * Binance Pay's order + certificate endpoints. The requests are signed with the
 * platform's merchant secret and the certificate decides which webhooks we
 * believe, so a non-loopback value must never be honoured.
 */

const REAL = 'https://bpay.binanceapi.com'

function okFetch(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: 'SUCCESS', code: '000000', data }),
  })
}

const checkout = {
  mode: 'one_time',
  hosted: true,
  providerPriceId: '',
  amount: 12.37,
  currency: 'usd',
  reference: 'platform_fee:t:p',
  successUrl: 'https://school.example/ok',
  cancelUrl: 'https://school.example/cancel',
  metadata: { kind: 'platform_fee', tenant_id: 't', payment_id: 'p' },
} as never

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isLoopbackOrigin', () => {
  it.each(['http://127.0.0.1:3099', 'http://127.4.5.6:1', 'http://localhost:3099', 'http://[::1]:3099', 'https://127.0.0.1'])(
    'accepts %s',
    (value) => expect(isLoopbackOrigin(value)).toBe(true),
  )

  it.each([
    'https://bpay.binanceapi.com',
    'http://127.0.0.1.evil.example',
    'http://10.0.0.1:3099',
    'http://0.0.0.0:3099',
    'ftp://127.0.0.1',
    '127.0.0.1:3099',
    'not a url',
    '',
  ])('rejects %s', (value) => expect(isLoopbackOrigin(value)).toBe(false))
})

describe('BinancePayProvider API host', () => {
  it('calls Binance when the override is unset', async () => {
    vi.stubEnv('BINANCE_PAY_API_BASE', '')
    const fetchMock = okFetch({ checkoutUrl: 'https://pay.binance.com/x', prepayId: 'P1' })
    vi.stubGlobal('fetch', fetchMock)

    await new BinancePayProvider('k', 's').createCheckoutSession(checkout)
    expect(fetchMock.mock.calls[0][0]).toBe(`${REAL}/binancepay/openapi/v3/order`)
  })

  it('sends the order to a loopback override, trailing slash trimmed, read per call', async () => {
    const fetchMock = okFetch({ checkoutUrl: 'https://pay.binance.com/x', prepayId: 'P1' })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new BinancePayProvider('k', 's')

    vi.stubEnv('BINANCE_PAY_API_BASE', 'http://127.0.0.1:3099/')
    await provider.createCheckoutSession(checkout)
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:3099/binancepay/openapi/v3/order')

    // Same instance, env changed: the host follows the process env.
    vi.stubEnv('BINANCE_PAY_API_BASE', '')
    await provider.createCheckoutSession(checkout)
    expect(fetchMock.mock.calls[1][0]).toBe(`${REAL}/binancepay/openapi/v3/order`)
  })

  it('ignores a non-loopback override for the order', async () => {
    vi.stubEnv('BINANCE_PAY_API_BASE', 'https://attacker.example')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = okFetch({ checkoutUrl: 'https://pay.binance.com/x', prepayId: 'P1' })
    vi.stubGlobal('fetch', fetchMock)

    await new BinancePayProvider('k', 's').createCheckoutSession(checkout)
    expect(fetchMock.mock.calls[0][0]).toBe(`${REAL}/binancepay/openapi/v3/order`)
  })

  it('never fetches the webhook certificate from a non-loopback override', async () => {
    vi.stubEnv('BINANCE_PAY_API_BASE', 'https://attacker.example')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const fetchMock = okFetch([{ certPublic: publicKey.export({ type: 'spki', format: 'pem' }), certSerial: 'sn' }])
    vi.stubGlobal('fetch', fetchMock)

    const body = '{"bizType":"PAY"}'
    const signature = crypto.createSign('RSA-SHA256').update(`1\nn\n${body}\n`).sign(privateKey, 'base64')
    await new BinancePayProvider('k', 's').verifyWebhook(body, {
      'binancepay-timestamp': '1',
      'binancepay-nonce': 'n',
      'binancepay-signature': signature,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${REAL}/binancepay/openapi/certificates`)
  })

  it('verifies a webhook against the certificate a loopback stub serves', async () => {
    vi.stubEnv('BINANCE_PAY_API_BASE', 'http://127.0.0.1:3099')
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const fetchMock = okFetch([{ certPublic: publicKey.export({ type: 'spki', format: 'pem' }), certSerial: 'sn' }])
    vi.stubGlobal('fetch', fetchMock)

    const body = '{"bizType":"PAY"}'
    const headers = (sig: string) => ({
      'binancepay-timestamp': '1',
      'binancepay-nonce': 'n',
      'binancepay-signature': sig,
    })
    const good = crypto.createSign('RSA-SHA256').update(`1\nn\n${body}\n`).sign(privateKey, 'base64')
    const provider = new BinancePayProvider('k', 's')

    expect(await provider.verifyWebhook(body, headers(good))).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:3099/binancepay/openapi/certificates')
    // A body the key did not sign is refused.
    expect(await provider.verifyWebhook('{"bizType":"PAY","x":1}', headers(good))).toBe(false)
  })
})
