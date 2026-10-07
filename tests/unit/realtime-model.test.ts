import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createLateBoundRealtimeModel,
  observeRealtimeSetup,
  parseRealtimeDescriptor,
} from '@/lib/speech/realtime-model'

describe('parseRealtimeDescriptor', () => {
  it('accepts the three realtime providers', () => {
    for (const provider of ['openai', 'xai', 'google']) {
      expect(parseRealtimeDescriptor({ provider, model: 'm-1.2' })).toEqual({ provider, model: 'm-1.2' })
    }
    expect(parseRealtimeDescriptor({ provider: 'openai', model: 'gpt-realtime', voice: 'marin' })?.voice).toBe('marin')
  })

  it('rejects other providers, bad model ids and non-objects', () => {
    expect(parseRealtimeDescriptor({ provider: 'anthropic', model: 'x' })).toBeNull()
    expect(parseRealtimeDescriptor({ provider: 'openai', model: '../etc' })).toBeNull()
    expect(parseRealtimeDescriptor({ provider: 'openai' })).toBeNull()
    expect(parseRealtimeDescriptor(null)).toBeNull()
    expect(parseRealtimeDescriptor('openai')).toBeNull()
  })
})

describe('createLateBoundRealtimeModel', () => {
  it('exposes getWebSocketConfig up front but refuses use before it is bound', () => {
    const { model } = createLateBoundRealtimeModel()
    expect(typeof model.getWebSocketConfig).toBe('function')
    expect(model.capabilities).toBeUndefined()
    expect(() => model.getWebSocketConfig!({ token: 't', url: 'wss://x.test' })).toThrow(/before the setup response/)
    expect(() => model.parseServerEvent({})).toThrow()
  })

  it('delegates to the provider model once bound, with no key involved', async () => {
    const late = createLateBoundRealtimeModel()
    await late.bind({ provider: 'openai', model: 'gpt-realtime' })
    expect(late.model.modelId).toBe('gpt-realtime')
    const ws = late.model.getWebSocketConfig!({ token: 'ephemeral', url: 'wss://api.openai.com/v1/realtime?model=gpt-realtime' })
    expect(ws.protocols).toContain('openai-insecure-api-key.ephemeral')
  })

  it('rebinds for a different provider on the next call', async () => {
    const late = createLateBoundRealtimeModel()
    await late.bind({ provider: 'openai', model: 'gpt-realtime' })
    await late.bind({ provider: 'google', model: 'gemini-live' })
    expect(late.model.modelId).toBe('gemini-live')
  })
})

describe('observeRealtimeSetup', () => {
  const realWindow = (globalThis as { window?: unknown }).window
  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = realWindow
  })

  function stubWindow(fetchImpl: typeof fetch) {
    const w = { fetch: fetchImpl } as unknown as Window & typeof globalThis
    ;(globalThis as { window?: unknown }).window = w
    return w
  }

  it('binds before the caller sees the response, once, then restores fetch', async () => {
    const order: string[] = []
    const original = vi.fn(async () =>
      Response.json({ token: 't', url: 'wss://x.test', provider: 'xai', model: 'grok-voice-latest' }),
    ) as unknown as typeof fetch
    const w = stubWindow(original)
    const stop = observeRealtimeSetup('/api/token?x=1', {
      onDescriptor: async (d) => {
        order.push(`bind:${d.provider}:${d.model}`)
      },
      onFailure: () => order.push('failure'),
    })
    expect(w.fetch).not.toBe(original)

    const res = await w.fetch('/api/token?x=1', { method: 'POST' })
    order.push('hook-sees-response')
    expect(order).toEqual(['bind:xai:grok-voice-latest', 'hook-sees-response'])
    expect((await res.json()).token).toBe('t') // body still readable by the hook
    expect(w.fetch).toBe(original) // restored after the one request
    stop()
    expect(w.fetch).toBe(original)
  })

  it('passes other requests through untouched', async () => {
    const original = vi.fn(async () => new Response('ok')) as unknown as typeof fetch
    const w = stubWindow(original)
    const stop = observeRealtimeSetup('/api/token', { onDescriptor: vi.fn(), onFailure: vi.fn() })
    await w.fetch('/api/other')
    expect(original).toHaveBeenCalledTimes(1)
    stop()
    expect(w.fetch).toBe(original)
  })

  it('reports a typed failure body and leaves the response intact', async () => {
    const body = JSON.stringify({ error: { code: 'ai_not_configured', canConfigure: true } })
    const original = vi.fn(async () => new Response(body, { status: 402 })) as unknown as typeof fetch
    const w = stubWindow(original)
    const onFailure = vi.fn()
    observeRealtimeSetup('/api/token', { onDescriptor: vi.fn(), onFailure })
    const res = await w.fetch('/api/token', { method: 'POST' })
    expect(res.status).toBe(402)
    expect(onFailure).toHaveBeenCalledWith(402, body)
  })

  it('fails the request when a 2xx response has no usable descriptor', async () => {
    const original = vi.fn(async () => Response.json({ token: 't', url: 'wss://x.test' })) as unknown as typeof fetch
    const w = stubWindow(original)
    observeRealtimeSetup('/api/token', { onDescriptor: vi.fn(), onFailure: vi.fn() })
    await expect(w.fetch('/api/token', { method: 'POST' })).rejects.toThrow(/Invalid realtime setup/)
  })
})
