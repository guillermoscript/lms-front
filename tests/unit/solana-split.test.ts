import { describe, it, expect } from 'vitest'
import { computeSplit } from '@/lib/payments/solana-split'

/**
 * Pure fee-split math (issue #280). These tests pin the money invariants:
 * the two legs always sum to exactly the total (no dust lost or created), the
 * platform share is floored, and the total is computed via Math.round.
 */
describe('computeSplit', () => {
  it('sum invariant: platformBase + schoolBase === totalBase (even split)', () => {
    const { totalBase, platformBase, schoolBase } = computeSplit(10, 20, 6)
    expect(totalBase).toBe(10_000_000)
    expect(platformBase).toBe(2_000_000)
    expect(schoolBase).toBe(8_000_000)
    expect(platformBase + schoolBase).toBe(totalBase)
  })

  it('sum invariant holds for an uneven (dust-prone) percentage', () => {
    // 33% of 10_000_000 = 3_300_000 exactly here, but assert the invariant.
    const { totalBase, platformBase, schoolBase } = computeSplit(10, 33, 6)
    expect(platformBase + schoolBase).toBe(totalBase)
  })

  it('floors the platform share and gives the remainder to the school', () => {
    // totalBase = round(0.0001 * 1e6) = 100; 33% → floor(33) = 33, school 67.
    const { totalBase, platformBase, schoolBase } = computeSplit(0.0001, 33, 6)
    expect(totalBase).toBe(100)
    expect(platformBase).toBe(33)
    expect(schoolBase).toBe(67)
    expect(platformBase + schoolBase).toBe(totalBase)
  })

  it('sum invariant survives a hostile remainder (totalBase=101, 33%)', () => {
    // floor(101 * 33 / 100) = floor(33.33) = 33; school = 68.
    const { totalBase, platformBase, schoolBase } = computeSplit(0.000101, 33, 6)
    expect(totalBase).toBe(101)
    expect(platformBase).toBe(33)
    expect(schoolBase).toBe(68)
    expect(platformBase + schoolBase).toBe(totalBase)
  })

  it('boundary platformPercent=0 → platform gets nothing, school gets all', () => {
    const { totalBase, platformBase, schoolBase } = computeSplit(5, 0, 9)
    expect(platformBase).toBe(0)
    expect(schoolBase).toBe(totalBase)
  })

  it('boundary platformPercent=100 → school gets nothing, platform gets all', () => {
    const { totalBase, platformBase, schoolBase } = computeSplit(5, 100, 9)
    expect(schoolBase).toBe(0)
    expect(platformBase).toBe(totalBase)
  })

  it('decimals=9 (SOL): totalBase = round(amountMajor * 1e9)', () => {
    const { totalBase } = computeSplit(1.5, 20, 9)
    expect(totalBase).toBe(1_500_000_000)
  })

  it('decimals=6 (USDC): totalBase = round(amountMajor * 1e6)', () => {
    const { totalBase } = computeSplit(25, 20, 6)
    expect(totalBase).toBe(25_000_000)
  })

  it('rounds float imprecision in the total via Math.round (0.1 SOL)', () => {
    // 0.1 * 1e9 = 100000000.00000001 in float; Math.round pins it to an integer.
    const { totalBase } = computeSplit(0.1, 20, 9)
    expect(totalBase).toBe(100_000_000)
    expect(Number.isInteger(totalBase)).toBe(true)
  })

  it('every leg is an integer base-unit amount', () => {
    const { totalBase, platformBase, schoolBase } = computeSplit(0.1, 7, 9)
    expect(Number.isInteger(totalBase)).toBe(true)
    expect(Number.isInteger(platformBase)).toBe(true)
    expect(Number.isInteger(schoolBase)).toBe(true)
    expect(platformBase + schoolBase).toBe(totalBase)
  })
})
