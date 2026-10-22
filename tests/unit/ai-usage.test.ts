import { describe, expect, it, vi } from 'vitest'

import { estimateCostUsd, priceForModel } from '@/lib/ai/pricing'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

describe('ai pricing', () => {
  it('matches the longest prefix, not the shorter family', () => {
    expect(priceForModel('gpt-4o-mini-2024-07-18')).toMatchObject({ input: 0.15 })
    expect(priceForModel('gpt-4o-2024-08-06')).toMatchObject({ input: 2.5 })
  })

  it('strips openrouter vendor prefix and variant suffix', () => {
    expect(priceForModel('openai/gpt-4o-mini:free')).toMatchObject({ input: 0.15 })
  })

  it('returns null for unknown models', () => {
    expect(priceForModel('some-new-model')).toBeNull()
    expect(estimateCostUsd('some-new-model', { inputTokens: 10, outputTokens: 10 })).toBeNull()
  })

  it('bills cached input at the cached rate', () => {
    const cost = estimateCostUsd('gpt-4o-mini', { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 })
    expect(cost).toBeCloseTo(0.075)
    expect(estimateCostUsd('gpt-4o-mini', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(0.75)
  })
})

describe('readUsage', () => {
  it('reads the nested spec shape', async () => {
    const { readUsage } = await import('@/lib/ai/usage-recorder')
    expect(
      readUsage({ inputTokens: { total: 120, cacheRead: 20 }, outputTokens: { total: 30, reasoning: 5 } }),
    ).toEqual({ input_tokens: 120, output_tokens: 30, cached_input_tokens: 20, reasoning_tokens: 5 })
  })

  it('tolerates missing or undefined usage', async () => {
    const { readUsage } = await import('@/lib/ai/usage-recorder')
    expect(readUsage(undefined)).toEqual({ input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, reasoning_tokens: 0 })
  })
})
