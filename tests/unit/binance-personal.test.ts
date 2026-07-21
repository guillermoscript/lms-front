import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import {
  BinancePersonalProvider,
  normalizePayHistory,
  signSapiQuery,
} from '@/lib/payments/binance-personal-provider'
import {
  reconcileBinancePersonalTransaction,
  noteContainsCode,
  type BinancePersonalTx,
} from '@/lib/payments/binance-personal-reconcile'
import {
  encryptCredential,
  decryptCredential,
  getPaymentCredentialsKey,
} from '@/lib/payments/credentials'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import type { BinancePayTransfer } from '@/lib/payments/binance-personal-provider'

/**
 * Pins the pure/offline parts of the binance_personal provider (issue #482):
 * the /sapi signing scheme, defensive Pay-history normalization, the note-code
 * matcher, the AES-256-GCM credential round-trip, the deterministic match-and-
 * flip reconciler (against a fluent Supabase fake), the capability-table sync,
 * and the checkout instructions payload. No network is touched.
 */

// ---------------------------------------------------------------------------
// signSapiQuery — standard Binance spot HMAC-SHA256 hex
// ---------------------------------------------------------------------------

describe('signSapiQuery', () => {
  it('matches an independently computed HMAC-SHA256 hex vector', () => {
    const secret = 'test-api-secret'
    const query = 'limit=100&recvWindow=10000&timestamp=1700000000000'
    const expected = crypto.createHmac('sha256', secret).update(query).digest('hex')
    expect(signSapiQuery(query, secret)).toBe(expected)
    // Sanity: hex, 64 chars (256-bit digest).
    expect(signSapiQuery(query, secret)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is sensitive to the secret and the query', () => {
    const q = 'timestamp=1'
    expect(signSapiQuery(q, 'a')).not.toBe(signSapiQuery(q, 'b'))
    expect(signSapiQuery('timestamp=1', 'a')).not.toBe(signSapiQuery('timestamp=2', 'a'))
  })
})

// ---------------------------------------------------------------------------
// normalizePayHistory — defensive parsing of /sapi/v1/pay/transactions
// ---------------------------------------------------------------------------

describe('normalizePayHistory', () => {
  it('keeps positive-amount rows and drops outgoing / invalid ones', () => {
    const rows = normalizePayHistory({
      data: [
        { orderId: 'A', amount: 25.5, currency: 'USDT', note: 'ok', transactionTime: 100 },
        { orderId: 'B', amount: -10, currency: 'USDT', note: 'outgoing' }, // negative → drop
        { orderId: 'C', amount: 0, currency: 'USDT' }, // zero → drop
        { orderId: 'D', amount: 'not-a-number', currency: 'USDT' }, // NaN → drop
        { amount: 5, currency: 'USDT' }, // no id → drop
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      orderId: 'A',
      amount: 25.5,
      currency: 'USDT',
      note: 'ok',
      transactionTime: 100,
    })
  })

  it('tolerates orderId vs transactionId and note vs remark field names', () => {
    const rows = normalizePayHistory({
      data: [
        { transactionId: 'TX9', amount: 12, currency: 'USDT', remark: 'via remark' },
        { orderId: 'O1', amount: 3, currency: 'USDT', note: 'via note' },
      ],
    })
    expect(rows[0]).toMatchObject({ orderId: 'TX9', note: 'via remark' })
    expect(rows[1]).toMatchObject({ orderId: 'O1', note: 'via note' })
  })

  it('defaults missing currency/note/time and returns [] when data is not an array', () => {
    const rows = normalizePayHistory({ data: [{ orderId: 'Z', amount: 7 }] })
    expect(rows[0]).toEqual({ orderId: 'Z', amount: 7, currency: '', note: '', transactionTime: 0 })

    expect(normalizePayHistory({ data: 'nope' })).toEqual([])
    expect(normalizePayHistory({})).toEqual([])
    expect(normalizePayHistory(null)).toEqual([])
    expect(normalizePayHistory(undefined)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// noteContainsCode — standalone digit-run match
// ---------------------------------------------------------------------------

describe('noteContainsCode', () => {
  it('matches the code as a standalone digit run', () => {
    expect(noteContainsCode('order 482 thanks', '482')).toBe(true)
    expect(noteContainsCode('482', '482')).toBe(true)
    expect(noteContainsCode('pago-482', '482')).toBe(true)
    expect(noteContainsCode('ref:482,gracias', '482')).toBe(true)
  })

  it('does NOT match a code embedded in a longer number', () => {
    expect(noteContainsCode('14825', '482')).toBe(false)
    expect(noteContainsCode('4820', '482')).toBe(false)
    expect(noteContainsCode('1482', '482')).toBe(false)
  })

  it('returns false for an empty note', () => {
    expect(noteContainsCode('', '482')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Credential encryption round-trip + master-key env handling
// ---------------------------------------------------------------------------

describe('credential encryption', () => {
  const KEY = 'a-master-key-for-tests'

  it('round-trips an encrypted credential', () => {
    const secret = 'binance-api-secret-value'
    const enc = encryptCredential(secret, KEY)
    expect(enc).not.toContain(secret)
    expect(enc.split(':')).toHaveLength(3) // iv:authTag:ciphertext
    expect(decryptCredential(enc, KEY)).toBe(secret)
  })

  it('produces a fresh IV per call (ciphertext differs, both decrypt back)', () => {
    const a = encryptCredential('same', KEY)
    const b = encryptCredential('same', KEY)
    expect(a).not.toBe(b)
    expect(decryptCredential(a, KEY)).toBe('same')
    expect(decryptCredential(b, KEY)).toBe('same')
  })

  it('throws when decrypting with the wrong key (GCM auth-tag mismatch)', () => {
    const enc = encryptCredential('secret', KEY)
    expect(() => decryptCredential(enc, 'wrong-key')).toThrow()
  })

  it('throws on a malformed encrypted payload', () => {
    expect(() => decryptCredential('garbage', KEY)).toThrow('Invalid encrypted credential format')
  })
})

describe('getPaymentCredentialsKey', () => {
  const ENV = 'PAYMENT_CREDENTIALS_ENCRYPTION_KEY'
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env[ENV]
  })
  afterEach(() => {
    if (saved === undefined) delete process.env[ENV]
    else process.env[ENV] = saved
  })

  it('throws when the env var is unset', () => {
    delete process.env[ENV]
    expect(() => getPaymentCredentialsKey()).toThrow(ENV)
  })

  it('returns the value when the env var is set', () => {
    process.env[ENV] = 'super-secret-master-key'
    expect(getPaymentCredentialsKey()).toBe('super-secret-master-key')
  })
})

// ---------------------------------------------------------------------------
// reconcileBinancePersonalTransaction — deterministic match-and-flip
// ---------------------------------------------------------------------------

/**
 * Fluent Supabase-admin fake. Two query shapes reach it:
 *  - the rule-2 collision count: `.select(cols, { count })...eq()...` awaited
 *    (never calls maybeSingle) → resolves `{ count, error }`.
 *  - the status-guarded flip: `.update()...select().maybeSingle()` → resolves
 *    the next queued `{ data, error }` (default: a flipped row).
 */
function makeAdmin(config: {
  count?: number
  countError?: unknown
  flips?: Array<{ data: unknown; error: unknown }>
} = {}) {
  const calls = { updates: [] as Record<string, unknown>[], countQueries: 0 }
  const flipQueue = [...(config.flips ?? [])]

  function builder() {
    const b: Record<string, unknown> = {
      select() {
        return b
      },
      update(values: Record<string, unknown>) {
        calls.updates.push(values)
        return b
      },
      eq() {
        return b
      },
      maybeSingle() {
        const next = flipQueue.length
          ? flipQueue.shift()!
          : { data: { transaction_id: 1 }, error: null }
        return Promise.resolve(next)
      },
      // The count query is awaited without maybeSingle — resolve it here.
      then(resolve: (v: { count: number; error: unknown }) => unknown) {
        calls.countQueries++
        return Promise.resolve({
          count: config.count ?? 0,
          error: config.countError ?? null,
        }).then(resolve)
      },
    }
    return b
  }

  const admin = { from: () => builder() }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls }
}

function tx(overrides: Partial<BinancePersonalTx> = {}): BinancePersonalTx {
  return {
    transaction_id: 482,
    amount: 25,
    tenant_id: 't1',
    plan_id: null,
    transaction_date: null,
    ...overrides,
  }
}

function transfer(overrides: Partial<BinancePayTransfer> = {}): BinancePayTransfer {
  return {
    orderId: 'ORD1',
    amount: 25,
    currency: 'USDT',
    note: '',
    transactionTime: Date.now(),
    ...overrides,
  }
}

describe('reconcileBinancePersonalTransaction', () => {
  it('rule 1: note carries the code and amount covers price → confirmed', async () => {
    const { admin, calls } = makeAdmin()
    const result = await reconcileBinancePersonalTransaction(admin, tx(), [
      transfer({ orderId: 'ORD-A', note: 'order 482 thanks', amount: 30 }),
    ])
    expect(result).toEqual({ status: 'confirmed', orderId: 'ORD-A' })
    expect(calls.countQueries).toBe(0) // rule 1 never needs the collision count
    expect(calls.updates[0]).toMatchObject({
      status: 'successful',
      provider_charge_id: 'ORD-A',
    })
    expect(calls.updates[0]).not.toHaveProperty('provider_subscription_id')
  })

  it('rule 1 on a plan tx also sets provider_subscription_id', async () => {
    const { admin, calls } = makeAdmin()
    const result = await reconcileBinancePersonalTransaction(admin, tx({ plan_id: 7 }), [
      transfer({ orderId: 'ORD-P', note: '482', amount: 25 }),
    ])
    expect(result).toEqual({ status: 'confirmed', orderId: 'ORD-P' })
    expect(calls.updates[0]).toMatchObject({
      status: 'successful',
      provider_charge_id: 'ORD-P',
      provider_subscription_id: 'ORD-P',
    })
  })

  it('rule 1 amount too low → not matched by that transfer (not_found)', async () => {
    const { admin, calls } = makeAdmin()
    const result = await reconcileBinancePersonalTransaction(admin, tx({ amount: 25 }), [
      transfer({ orderId: 'ORD-LOW', note: 'order 482', amount: 10 }),
    ])
    expect(result).toEqual({ status: 'not_found' })
    expect(calls.updates).toHaveLength(0)
  })

  it('rule 2: exact amount + exactly one pending → confirmed', async () => {
    const { admin, calls } = makeAdmin({ count: 1 })
    const result = await reconcileBinancePersonalTransaction(admin, tx(), [
      transfer({ orderId: 'ORD-EX', amount: 25, note: '' }),
    ])
    expect(result).toEqual({ status: 'confirmed', orderId: 'ORD-EX' })
    expect(calls.countQueries).toBe(1)
    expect(calls.updates[0]).toMatchObject({ provider_charge_id: 'ORD-EX' })
  })

  it('rule 2 ambiguity: exact amount but two pendings → ambiguous, no update', async () => {
    const { admin, calls } = makeAdmin({ count: 2 })
    const result = await reconcileBinancePersonalTransaction(admin, tx(), [
      transfer({ orderId: 'ORD-EX', amount: 25, note: '' }),
    ])
    expect(result).toEqual({ status: 'ambiguous' })
    expect(calls.countQueries).toBe(1)
    expect(calls.updates).toHaveLength(0)
  })

  it('no matching transfer at all → not_found', async () => {
    const { admin, calls } = makeAdmin({ count: 1 })
    const result = await reconcileBinancePersonalTransaction(admin, tx({ amount: 25 }), [
      transfer({ orderId: 'ORD-OTHER', amount: 99, note: 'unrelated' }),
    ])
    expect(result).toEqual({ status: 'not_found' })
    expect(calls.updates).toHaveLength(0)
  })

  it('flip returns 23505 on the only candidate → replayed', async () => {
    const { admin, calls } = makeAdmin({
      flips: [{ data: null, error: { code: '23505' } }],
    })
    const result = await reconcileBinancePersonalTransaction(admin, tx(), [
      transfer({ orderId: 'ORD-DUP', note: '482', amount: 25 }),
    ])
    expect(result).toEqual({ status: 'replayed' })
    expect(calls.updates).toHaveLength(1) // attempted once, then exhausted
  })

  it('flip returns a null row (concurrent confirm) → confirmed alreadyProcessed', async () => {
    const { admin } = makeAdmin({ flips: [{ data: null, error: null }] })
    const result = await reconcileBinancePersonalTransaction(admin, tx(), [
      transfer({ orderId: 'ORD-RACE', note: '482', amount: 25 }),
    ])
    expect(result).toEqual({ status: 'confirmed', alreadyProcessed: true })
  })

  it('ignores non-USDT transfers (currency filter)', async () => {
    const { admin, calls } = makeAdmin({ count: 1 })
    const result = await reconcileBinancePersonalTransaction(admin, tx(), [
      transfer({ orderId: 'ORD-BTC', currency: 'BTC', note: '482', amount: 25 }),
    ])
    expect(result).toEqual({ status: 'not_found' })
    expect(calls.updates).toHaveLength(0)
  })

  it('surfaces a collision-count query error as error', async () => {
    const { admin } = makeAdmin({ count: 0, countError: { message: 'boom' } })
    const result = await reconcileBinancePersonalTransaction(admin, tx(), [
      transfer({ orderId: 'ORD-EX', amount: 25, note: '' }),
    ])
    expect(result).toMatchObject({ status: 'error' })
  })
})

// ---------------------------------------------------------------------------
// Capability table stays in sync with the provider class
// ---------------------------------------------------------------------------

describe('PROVIDER_CAPABILITIES sync', () => {
  it('binance_personal static entry matches the class capabilities', () => {
    expect(new BinancePersonalProvider().capabilities).toEqual(
      PROVIDER_CAPABILITIES.binance_personal,
    )
  })
})

// ---------------------------------------------------------------------------
// createCheckoutSession — manual-transfer instructions, no provider call
// ---------------------------------------------------------------------------

describe('BinancePersonalProvider.createCheckoutSession', () => {
  const provider = new BinancePersonalProvider()

  it('returns instructions with payId/amount/USDT/code', async () => {
    const session = await provider.createCheckoutSession({
      mode: 'one_time',
      providerPriceId: 'price_1',
      amount: 25,
      currency: 'USD',
      reference: '482',
      destinationAccount: 'school-pay-id',
    })
    expect(session).toEqual({
      kind: 'instructions',
      reference: '482',
      instructions: {
        payId: 'school-pay-id',
        amount: 25,
        currency: 'USDT',
        code: '482',
      },
    })
  })

  it('throws when the school has no configured Pay ID', async () => {
    await expect(
      provider.createCheckoutSession({
        mode: 'one_time',
        providerPriceId: 'price_1',
        amount: 25,
        currency: 'USD',
        reference: '482',
      }),
    ).rejects.toThrow('Binance Pay ID')
  })
})
