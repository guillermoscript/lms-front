import { describe, expect, it, vi } from 'vitest'

import {
  TraceContentGuardProcessor,
  isContentAttribute,
  stripSpanContent,
  tenantIdOfSpan,
} from '@/lib/ai/trace-content-guard'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'

function span(attributes: Record<string, unknown>, events: { name: string; attributes?: Record<string, unknown> }[] = []) {
  return { attributes: { ...attributes }, events } as never
}

const aiSpan = (tenantId?: string) =>
  span(
    {
      ...(tenantId ? { 'langfuse.trace.metadata.tenantId': tenantId } : {}),
      'langfuse.trace.metadata.feature': 'lesson_tutor',
      'ai.prompt.messages': '[{"role":"user","content":"my secret essay"}]',
      'ai.prompt': '{"system":"be nice"}',
      'ai.response.text': 'the answer',
      'ai.response.toolCalls': '[]',
      'ai.toolCall.args': '{"q":1}',
      'ai.toolCall.result': '{"ok":true}',
      'gen_ai.input.messages': '[]',
      'gen_ai.output.messages': '[]',
      'langfuse.observation.input': 'x',
      'langfuse.observation.output': 'y',
      'ai.usage.inputTokens': 12,
      'ai.usage.outputTokens': 34,
      'ai.model.id': 'gpt-5-mini',
      'ai.response.finishReason': 'stop',
    },
    [{ name: 'exception', attributes: { 'exception.message': 'echoed prompt text', 'exception.type': 'APICallError' } }],
  )

function harness(lookup: (t: string) => Promise<boolean>, now = () => 1_000) {
  const ended: unknown[] = []
  const inner = {
    onStart: vi.fn(),
    onEnd: vi.fn((s: unknown) => void ended.push(s)),
    forceFlush: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }
  const guard = new TraceContentGuardProcessor(inner as never, { lookup, now })
  return { guard, inner, ended }
}

describe('isContentAttribute', () => {
  it.each([
    'ai.prompt',
    'ai.prompt.messages',
    'ai.response.text',
    'ai.response.object',
    'ai.response.toolCalls',
    'ai.toolCall.args',
    'ai.toolCall.result',
    'gen_ai.input.messages',
    'gen_ai.output.messages',
    'langfuse.observation.input',
    'langfuse.trace.output',
    'input.value',
  ])('treats %s as content', (key) => expect(isContentAttribute(key)).toBe(true))

  it.each([
    'ai.usage.inputTokens',
    'ai.model.id',
    'ai.response.finishReason',
    'ai.response.id',
    'gen_ai.usage.input_tokens',
    'langfuse.trace.metadata.tenantId',
    'langfuse.observation.metadata.feature',
    'langfuse.user.id',
  ])('keeps %s', (key) => expect(isContentAttribute(key)).toBe(false))
})

describe('stripSpanContent / tenantIdOfSpan', () => {
  it('removes text but keeps usage, model, metadata and the exception type', () => {
    const s = aiSpan(TENANT_A) as { attributes: Record<string, unknown>; events: { attributes: Record<string, unknown> }[] }
    expect(tenantIdOfSpan(s as never)).toBe(TENANT_A)
    expect(stripSpanContent(s as never)).toBeGreaterThan(5)
    expect(Object.keys(s.attributes).sort()).toEqual(
      [
        'ai.model.id',
        'ai.response.finishReason',
        'ai.usage.inputTokens',
        'ai.usage.outputTokens',
        'langfuse.trace.metadata.feature',
        'langfuse.trace.metadata.tenantId',
      ].sort(),
    )
    expect(s.events[0].attributes).toEqual({ 'exception.type': 'APICallError' })
  })

  it('reads the observation-level tenant attribute too, and ignores empty values', () => {
    expect(tenantIdOfSpan(span({ 'langfuse.observation.metadata.tenantId': TENANT_B }))).toBe(TENANT_B)
    expect(tenantIdOfSpan(span({ 'langfuse.trace.metadata.tenantId': '' }))).toBeUndefined()
    expect(tenantIdOfSpan(span({}))).toBeUndefined()
  })
})

describe('TraceContentGuardProcessor', () => {
  it('strips content for an opted-out tenant, then forwards the span', async () => {
    const { guard, inner, ended } = harness(async () => false)
    const s = aiSpan(TENANT_A)
    guard.onEnd(s)
    await guard.forceFlush()
    expect(inner.onEnd).toHaveBeenCalledTimes(1)
    expect(ended[0]).toBe(s)
    expect((s as never as { attributes: Record<string, unknown> }).attributes).not.toHaveProperty('ai.prompt.messages')
    expect((s as never as { attributes: Record<string, unknown> }).attributes).toHaveProperty('ai.usage.inputTokens', 12)
  })

  it('keeps content when the tenant allows it (the default)', async () => {
    const { guard } = harness(async () => true)
    const s = aiSpan(TENANT_A)
    guard.onEnd(s)
    await guard.forceFlush()
    expect((s as never as { attributes: Record<string, unknown> }).attributes).toHaveProperty('ai.response.text', 'the answer')
  })

  it('fails private: an unreadable preference drops the text', async () => {
    const { guard } = harness(async () => {
      throw new Error('db down')
    })
    const s = aiSpan(TENANT_A)
    guard.onEnd(s)
    await guard.forceFlush()
    expect((s as never as { attributes: Record<string, unknown> }).attributes).not.toHaveProperty('ai.response.text')
  })

  it('passes spans with no tenant straight through without a lookup', () => {
    const lookup = vi.fn()
    const { guard, inner } = harness(lookup)
    guard.onEnd(aiSpan(undefined))
    expect(lookup).not.toHaveBeenCalled()
    expect(inner.onEnd).toHaveBeenCalledTimes(1)
  })

  it('looks a tenant up once per ttl, deduplicating concurrent spans, and decides per tenant', async () => {
    let t = 1_000
    const lookup = vi.fn(async (tenant: string) => tenant === TENANT_B)
    const { guard } = harness(lookup, () => t)
    const a1 = aiSpan(TENANT_A)
    const a2 = aiSpan(TENANT_A)
    const b = aiSpan(TENANT_B)
    guard.onEnd(a1)
    guard.onEnd(a2)
    guard.onEnd(b)
    await guard.forceFlush()
    expect(lookup).toHaveBeenCalledTimes(2) // A once (deduped), B once
    const attrs = (x: unknown) => (x as { attributes: Record<string, unknown> }).attributes
    expect(attrs(a1)).not.toHaveProperty('ai.response.text')
    expect(attrs(a2)).not.toHaveProperty('ai.response.text')
    expect(attrs(b)).toHaveProperty('ai.response.text')

    // Within the ttl: cached, still synchronous.
    const a3 = aiSpan(TENANT_A)
    guard.onEnd(a3)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(attrs(a3)).not.toHaveProperty('ai.response.text')

    // After the ttl an opt-in is picked up.
    t += 61_000
    lookup.mockImplementation(async () => true)
    const a4 = aiSpan(TENANT_A)
    guard.onEnd(a4)
    await guard.forceFlush()
    expect(lookup).toHaveBeenCalledTimes(3)
    expect(attrs(a4)).toHaveProperty('ai.response.text')
  })

  it('delegates onStart and shutdown to the wrapped processor', async () => {
    const { guard, inner } = harness(async () => true)
    guard.onStart({} as never, {} as never)
    await guard.shutdown()
    expect(inner.onStart).toHaveBeenCalledTimes(1)
    expect(inner.shutdown).toHaveBeenCalledTimes(1)
  })

  it('a throwing inner processor never breaks the caller', async () => {
    const { guard, inner } = harness(async () => false)
    inner.onEnd.mockImplementation(() => {
      throw new Error('exporter blew up')
    })
    expect(() => guard.onEnd(aiSpan(TENANT_A))).not.toThrow()
    await expect(guard.forceFlush()).resolves.toBeUndefined()
  })
})
