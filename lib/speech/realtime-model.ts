/**
 * Browser side of BYOK realtime voice.
 *
 * The school picks the realtime provider and model (feature `voice_conversation`),
 * so the browser cannot know them at build time. The token route answers with
 * `{ token, url, tools, provider, model, voice }`; this module turns `provider`
 * and `model` into the model object `experimental_useRealtime` needs. Only an
 * ephemeral token ever reaches the browser: the school's key stays on the server,
 * and the provider packages are loaded here only for their wire-protocol parsers
 * (constructing a realtime model needs no credential).
 *
 * This file is the one client-side exception to the "no provider SDK outside
 * lib/ai/providers.ts" ESLint rule, and it is allowed to be one because it can
 * never hold a key. It is imported by client components only; do not import it
 * from server code.
 *
 * Why a late-bound model: the hook fetches the setup endpoint itself, on
 * `connect()`, and needs a model object up front. The object it gets is a thin
 * stand-in that delegates every call to the real provider model once the setup
 * response has told us which one. `observeRealtimeSetup` is what reads that
 * response (the hook calls `fetch(api.token)` exactly once per connect; we
 * observe it, never replace it), so one token is minted per call, never two.
 */
import type { Experimental_RealtimeModel as RealtimeModel } from 'ai'

export const REALTIME_CLIENT_PROVIDERS = ['openai', 'xai', 'google'] as const
export type RealtimeClientProvider = (typeof REALTIME_CLIENT_PROVIDERS)[number]

export interface RealtimeDescriptor {
  provider: RealtimeClientProvider
  model: string
  voice?: string
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/

/** Validates the `{ provider, model, voice }` part of a token response. */
export function parseRealtimeDescriptor(payload: unknown): RealtimeDescriptor | null {
  if (!payload || typeof payload !== 'object') return null
  const { provider, model, voice } = payload as Record<string, unknown>
  if (!REALTIME_CLIENT_PROVIDERS.includes(provider as RealtimeClientProvider)) return null
  if (typeof model !== 'string' || !MODEL_ID.test(model)) return null
  return {
    provider: provider as RealtimeClientProvider,
    model,
    ...(typeof voice === 'string' && voice ? { voice } : {}),
  }
}

/** The provider's own browser-side realtime model (parsers/serializers), code-split per provider. */
export async function buildRealtimeModel(descriptor: RealtimeDescriptor): Promise<RealtimeModel> {
  switch (descriptor.provider) {
    case 'openai':
      return (await import('@ai-sdk/openai')).openai.experimental_realtime(descriptor.model)
    case 'xai':
      return (await import('@ai-sdk/xai')).xai.experimental_realtime(descriptor.model)
    case 'google':
      return (await import('@ai-sdk/google')).google.experimental_realtime(descriptor.model)
  }
}

export interface LateBoundRealtimeModel {
  /** Stable for the component's lifetime: pass this to `experimental_useRealtime`. */
  model: RealtimeModel
  /** Resolve the stand-in to the provider model described by a token response. */
  bind(descriptor: RealtimeDescriptor): Promise<void>
}

export function createLateBoundRealtimeModel(): LateBoundRealtimeModel {
  let inner: RealtimeModel | null = null
  const bound = (): RealtimeModel => {
    if (!inner) throw new Error('Realtime model used before the setup response arrived')
    return inner
  }

  const model: RealtimeModel = {
    specificationVersion: 'v4',
    get provider() {
      return inner?.provider ?? 'unresolved'
    },
    get modelId() {
      return inner?.modelId ?? ''
    },
    get capabilities() {
      return inner?.capabilities
    },
    // Optional hooks the session reads off the model: expose them only when the
    // real model has them (the same truthiness the session would see).
    get createServerEventParser() {
      const fn = inner?.createServerEventParser
      return fn ? fn.bind(inner) : undefined
    },
    get getHealthCheckResponse() {
      const fn = inner?.getHealthCheckResponse
      return fn ? fn.bind(inner) : undefined
    },
    // Present up front: the session checks for it before the setup fetch.
    getWebSocketConfig: (options) => {
      const real = bound()
      if (!real.getWebSocketConfig) throw new Error('Realtime model does not support client-secret WebSockets')
      return real.getWebSocketConfig(options)
    },
    parseServerEvent: (raw) => bound().parseServerEvent(raw),
    serializeClientEvent: (event) => bound().serializeClientEvent(event),
    buildSessionConfig: (config) => bound().buildSessionConfig(config),
  }

  return {
    model,
    async bind(descriptor) {
      inner = await buildRealtimeModel(descriptor)
    },
  }
}

export interface RealtimeSetupObserver {
  /** Called with a valid descriptor BEFORE the hook sees the response. */
  onDescriptor(descriptor: RealtimeDescriptor): Promise<void>
  /** A non-2xx setup response, with its raw body text (for typed AI errors). */
  onFailure(status: number, bodyText: string): void
}

/**
 * Watches the hook's single setup request for the duration of one `connect()`.
 *
 * Wraps `window.fetch` for exactly `tokenUrl`, hands the response (a clone) to
 * the observer before the hook reads it, and puts `window.fetch` back after the
 * first matching request or when the returned function is called, whichever
 * comes first. Every other request passes straight through. The caller must
 * call the returned function in a `finally` around `connect()`.
 */
export function observeRealtimeSetup(tokenUrl: string, observer: RealtimeSetupObserver): () => void {
  const original = window.fetch
  let active = true

  const restore = () => {
    active = false
    if (window.fetch === wrapped) window.fetch = original
  }

  const wrapped: typeof window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!active || url !== tokenUrl) return original.call(window, input, init)
    restore() // one request only
    const response = await original.call(window, input, init)
    if (response.ok) {
      const descriptor = parseRealtimeDescriptor(await response.clone().json().catch(() => null))
      if (!descriptor) throw new Error('Invalid realtime setup: missing provider or model')
      await observer.onDescriptor(descriptor)
    } else {
      observer.onFailure(response.status, await response.clone().text().catch(() => ''))
    }
    return response
  }

  window.fetch = wrapped
  return restore
}
