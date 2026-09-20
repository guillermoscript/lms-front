import { describe, it, expect, vi } from 'vitest'
import { capChatHistory } from '@/lib/ai/chat-helpers'
import { checkAiChatUsage } from '@/lib/ai/chat-usage'
import { classifyAiChatError } from '@/lib/ai/chat-error'

/**
 * Pins the client half of issue #807's durable AI chat budget:
 *   - `capChatHistory` — the deterministic conversation-length cap
 *   - `checkAiChatUsage` — the thin wrapper around the `increment_ai_chat_usage`
 *     RPC, including its fail-open behavior on a DB error
 *   - `classifyAiChatError` — turning a 429 body back into a UI-friendly kind
 * The SQL side (the SECURITY DEFINER function itself, its advisory locks, the
 * plan-limit backfill) is not exercised here — there is no local Postgres in
 * this run. See migrations 20260920150000 / 20260920160000.
 */

describe('capChatHistory', () => {
  it('returns the array unchanged when under the limit', () => {
    const messages = [1, 2, 3]
    expect(capChatHistory(messages, 5)).toBe(messages)
  })

  it('returns the array unchanged when exactly at the limit', () => {
    const messages = [1, 2, 3, 4, 5]
    expect(capChatHistory(messages, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps only the most recent `limit` messages when over the limit', () => {
    const messages = Array.from({ length: 10 }, (_, i) => i)
    expect(capChatHistory(messages, 4)).toEqual([6, 7, 8, 9])
  })

  it('never mutates the input array', () => {
    const messages = Array.from({ length: 10 }, (_, i) => i)
    const copy = [...messages]
    capChatHistory(messages, 4)
    expect(messages).toEqual(copy)
  })
})

function fakeSupabase(rpcResult: { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('checkAiChatUsage', () => {
  it('allows the turn when the RPC reports allowed: true', async () => {
    const supabase = fakeSupabase({ data: { allowed: true, reason: 'ok' }, error: null })
    const result = await checkAiChatUsage(supabase, 'tenant-1', 'user-1')
    expect(result).toEqual({ allowed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('increment_ai_chat_usage', {
      _tenant_id: 'tenant-1',
      _user_id: 'user-1',
    })
  })

  it('blocks with reason daily_limit when the RPC refuses on the daily cap', async () => {
    const supabase = fakeSupabase({ data: { allowed: false, reason: 'daily_limit' }, error: null })
    const result = await checkAiChatUsage(supabase, 'tenant-1', 'user-1')
    expect(result).toEqual({ allowed: false, reason: 'daily_limit' })
  })

  it('blocks with reason monthly_limit when the RPC refuses on the monthly budget', async () => {
    const supabase = fakeSupabase({ data: { allowed: false, reason: 'monthly_limit' }, error: null })
    const result = await checkAiChatUsage(supabase, 'tenant-1', 'user-1')
    expect(result).toEqual({ allowed: false, reason: 'monthly_limit' })
  })

  it('treats an unrecognised refusal reason as the daily cap, never as unlimited', async () => {
    const supabase = fakeSupabase({ data: { allowed: false, reason: 'something_new' }, error: null })
    const result = await checkAiChatUsage(supabase, 'tenant-1', 'user-1')
    expect(result).toEqual({ allowed: false, reason: 'daily_limit' })
  })

  it('fails OPEN when the RPC errors — a DB hiccup must not take the tutor down', async () => {
    const supabase = fakeSupabase({ data: null, error: { message: 'connection reset' } })
    const result = await checkAiChatUsage(supabase, 'tenant-1', 'user-1')
    expect(result).toEqual({ allowed: true })
  })
})

describe('classifyAiChatError', () => {
  it('classifies the in-memory burst limiter body', () => {
    const error = new Error(JSON.stringify({ code: 'ai_chat_rate_limited' }))
    expect(classifyAiChatError(error)).toBe('burst')
  })

  it('classifies the durable daily-cap body', () => {
    const error = new Error(JSON.stringify({ code: 'ai_chat_usage_limit', scope: 'daily_limit' }))
    expect(classifyAiChatError(error)).toBe('daily')
  })

  it('classifies the durable monthly-budget body', () => {
    const error = new Error(JSON.stringify({ code: 'ai_chat_usage_limit', scope: 'monthly_limit' }))
    expect(classifyAiChatError(error)).toBe('monthly')
  })

  it('falls back to generic for a non-JSON error message', () => {
    expect(classifyAiChatError(new Error('The response body is empty.'))).toBe('generic')
  })

  it('falls back to generic for an unrelated JSON body', () => {
    expect(classifyAiChatError(new Error(JSON.stringify({ code: 'some_other_error' })))).toBe('generic')
  })

  it('falls back to generic when there is no error', () => {
    expect(classifyAiChatError(undefined)).toBe('generic')
  })
})
