import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Pins the RESUME contract of pullSplitForSubscription (H2, security review
 * #334): given `alreadyPulledBase`, it pulls ONLY the legs not yet covered this
 * period, and never re-pulls a covered leg. This is the monotonic-safety
 * property — passing a non-zero alreadyPulledBase can only ever cause fewer
 * pulls, never more, so it cannot double-charge.
 *
 * `pullOnce` (the only network call) is mocked to record amounts.
 */

const pullCalls: { receiverAta: string; amountBase: bigint }[] = []

vi.mock('@/lib/payments/solana-subscriptions', () => ({
  pullOnce: vi.fn(async (p: { receiverAta: string; amountBase: bigint }) => {
    pullCalls.push({ receiverAta: p.receiverAta, amountBase: p.amountBase })
  }),
}))

import { pullSplitForSubscription } from '@/lib/payments/solana-subscription-pull'

// Valid base58 pubkeys (offline ATA derivation works; no network).
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC
const SCHOOL = 'So11111111111111111111111111111111111111112'
const PLATFORM = '11111111111111111111111111111111'
const SUBSCRIBER = 'Vote111111111111111111111111111111111111111'

// computeSplit(10, 20, 6): total=10_000_000, platform=2_000_000, school=8_000_000.
const SCHOOL_BASE = BigInt(8_000_000)
const PLATFORM_BASE = BigInt(2_000_000)

function base(alreadyPulledBase?: bigint) {
  return {
    rpcUrl: 'http://localhost',
    pullerSecretKeyBase58: 'dummy',
    subscriber: SUBSCRIBER,
    merchant: SUBSCRIBER,
    planId: BigInt(1),
    mint: MINT,
    schoolWallet: SCHOOL,
    platformWallet: PLATFORM,
    priceMajor: 10,
    platformPercent: 20,
    alreadyPulledBase,
  }
}

describe('pullSplitForSubscription resume contract', () => {
  beforeEach(() => {
    pullCalls.length = 0
  })

  it('alreadyPulled=0 → pulls BOTH legs (school then platform)', async () => {
    await pullSplitForSubscription(base(BigInt(0)))
    expect(pullCalls.map((c) => c.amountBase)).toEqual([SCHOOL_BASE, PLATFORM_BASE])
  })

  it('alreadyPulled undefined → defaults to both legs', async () => {
    await pullSplitForSubscription(base(undefined))
    expect(pullCalls).toHaveLength(2)
  })

  it('alreadyPulled = schoolBase → skips school, resumes ONLY the platform leg', async () => {
    await pullSplitForSubscription(base(SCHOOL_BASE))
    expect(pullCalls).toHaveLength(1)
    expect(pullCalls[0].amountBase).toBe(PLATFORM_BASE)
  })

  it('alreadyPulled = full cap → pulls NOTHING (idempotent, no double-charge)', async () => {
    await pullSplitForSubscription(base(SCHOOL_BASE + PLATFORM_BASE))
    expect(pullCalls).toHaveLength(0)
  })

  it('platformPercent=0 → only the school leg, never a zero platform pull', async () => {
    await pullSplitForSubscription({ ...base(BigInt(0)), platformPercent: 0 })
    expect(pullCalls).toHaveLength(1)
    expect(pullCalls[0].amountBase).toBe(BigInt(10_000_000))
  })
})
