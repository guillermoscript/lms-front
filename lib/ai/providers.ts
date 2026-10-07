/**
 * The ONLY file allowed to import provider SDKs (`@ai-sdk/<provider>`,
 * `@openrouter/ai-sdk-provider`, `openai`); ESLint enforces it. Everything
 * provider-specific lives here: how to build a model from a tenant's key, how
 * to check that key, how to list its models, and (later) provider option blocks.
 *
 * Security shape:
 * - Fixed allowlist of hosts. There is no free-form baseURL, so a school admin
 *   can never point the server at an internal address (SSRF) or at a host that
 *   reflects the key. Custom OpenAI-compatible endpoints are a v2 decision.
 * - Every factory gets an explicit `apiKey`; nothing reads `OPENAI_API_KEY` & co.
 * - `validate` / `listModels` send the key in headers only, with an 8s timeout
 *   and `redirect: 'manual'` (a redirect would replay the key header elsewhere).
 * - Nothing here logs, throws or returns the key or a provider response body.
 *
 * Test hook: outside production, `AI_PROVIDER_BASE_URL_OVERRIDE=http://host:port`
 * sends every provider to `<override>/<providerId>` (a stub server), for E2E
 * specs that assert which Authorization header reached which provider.
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogle } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai'
import { createXai } from '@ai-sdk/xai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { ImageModel, LanguageModel, TranscriptionModel } from 'ai'

import { mergeCaps, inferModelCaps, type ModelCaps } from './capabilities'
import { AiKeyInvalidError, AiModelUnsupportedError, AiProviderError, classifyProviderError } from './errors'
import {
  PROVIDER_IDS,
  PROVIDER_KINDS,
  PROVIDER_LABELS,
  isProviderId,
  type ProviderId,
  type ProviderKind,
} from './provider-ids'

export { PROVIDER_IDS, PROVIDER_KINDS, PROVIDER_LABELS, isProviderId }
export type { ProviderId, ProviderKind }

// --- types ------------------------------------------------------------------

/** Options for minting a browser-safe realtime token (model, expiry, session config). */
export type RealtimeTokenOptions = Parameters<OpenAIProvider['experimental_realtime']['getToken']>[0]
export type RealtimeToken = Awaited<ReturnType<OpenAIProvider['experimental_realtime']['getToken']>>

/**
 * A provider bound to one tenant's key. Methods throw `AiModelUnsupportedError`
 * when the provider does not serve that kind (e.g. `imageModel` on Anthropic).
 */
export interface ProviderInstance {
  readonly id: ProviderId
  languageModel(modelId: string): LanguageModel
  transcriptionModel(modelId: string): TranscriptionModel
  imageModel(modelId: string): ImageModel
  /** Only OpenAI, xAI and Google. Mints a short-lived token; the real key never leaves the server. */
  readonly realtime?: { getToken(options: RealtimeTokenOptions): Promise<RealtimeToken> }
}

export interface ValidateResult {
  ok: boolean
  /** HTTP status the provider answered with; absent on timeout / network failure. */
  status?: number
  reason?: 'timeout' | 'network' | 'redirect'
}

export interface ListedModel {
  id: string
  label?: string
  caps?: ModelCaps
}

export interface ProviderDef {
  id: ProviderId
  label: string
  kinds: readonly ProviderKind[]
  /** Hostname requests go to (documentation / allowlist; the full URLs are below). */
  host: string
  create(apiKey: string): ProviderInstance
  validate(apiKey: string): Promise<ValidateResult>
  listModels(apiKey: string): Promise<ListedModel[]>
  /** Realtime voices the provider accepts, when it has realtime. */
  voices?: readonly string[]
}

// --- base URLs (fixed) + test override --------------------------------------

const DEFAULT_BASE: Record<ProviderId, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com',
  assemblyai: 'https://api.assemblyai.com/v2',
}

function testOverride(): string | null {
  if (process.env.NODE_ENV === 'production') return null
  const raw = process.env.AI_PROVIDER_BASE_URL_OVERRIDE
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return raw.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** Base URL requests for `id` go to (the provider's real host, or the test stub). */
export function providerBaseUrl(id: ProviderId): string {
  const override = testOverride()
  return override ? `${override}/${id}` : DEFAULT_BASE[id]
}

/** The SDKs already know their own default URL; only pass one when the stub is active. */
function sdkBaseUrl(id: ProviderId): { baseURL?: string } {
  const override = testOverride()
  return override ? { baseURL: `${override}/${id}` } : {}
}

// --- probing ----------------------------------------------------------------

const PROBE_TIMEOUT_MS = 8000

type ProbeOutcome =
  | { kind: 'response'; res: Response }
  | { kind: 'failed'; reason: 'timeout' | 'network' }

async function probe(url: string, headers: Record<string, string>): Promise<ProbeOutcome> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      // A redirect would resend the key header to wherever Location points.
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    })
    return { kind: 'response', res }
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    return { kind: 'failed', reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network' }
  }
}

function isRedirect(res: Response): boolean {
  return res.status >= 300 && res.status < 400
}

/** Frees the connection without reading what the provider said. */
async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel()
  } catch {
    /* already closed */
  }
}

async function runValidate(url: string, headers: Record<string, string>): Promise<ValidateResult> {
  const out = await probe(url, headers)
  if (out.kind === 'failed') return { ok: false, reason: out.reason }
  const { res } = out
  await discard(res)
  if (isRedirect(res)) return { ok: false, status: res.status, reason: 'redirect' }
  // 403 means the key authenticated but is scoped down (e.g. an OpenAI restricted key without
  // `models.read`, which can still chat). Only 401/400-style answers prove a bad key.
  return { ok: res.ok || res.status === 403, status: res.status }
}

/** Typed error for a failed listing call; never carries the provider's body. */
function listingError(providerId: ProviderId, outcome: ProbeOutcome): Error {
  if (outcome.kind === 'failed') return new AiProviderError({ providerId, transient: true })
  const status = outcome.res.status
  if (isRedirect(outcome.res)) return new AiProviderError({ providerId, upstreamStatus: status })
  return classifyProviderError({ statusCode: status }, { providerId })
}

async function fetchJson(providerId: ProviderId, url: string, headers: Record<string, string>): Promise<unknown> {
  const out = await probe(url, headers)
  if (out.kind === 'failed' || !out.res.ok) {
    if (out.kind === 'response') await discard(out.res)
    throw listingError(providerId, out)
  }
  try {
    return await out.res.json()
  } catch {
    throw new AiProviderError({ providerId, upstreamStatus: out.res.status })
  }
}

// --- listing parsers --------------------------------------------------------

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const MAX_MODELS = 2000

/** `{data:[...]}` (most providers), `{models:[...]}` (Google) or a bare array (Mistral docs). */
function rows(json: unknown): Json[] {
  const list = Array.isArray(json) ? json : isObj(json) ? (json.data ?? json.models) : undefined
  return Array.isArray(list) ? list.filter(isObj).slice(0, MAX_MODELS) : []
}

function listed(providerId: ProviderId, id: unknown, label: unknown, reported?: ModelCaps): ListedModel | null {
  if (typeof id !== 'string' || !id || id.length > 200) return null
  return {
    id,
    label: typeof label === 'string' && label ? label.slice(0, 120) : undefined,
    caps: mergeCaps(inferModelCaps(providerId, id), reported),
  }
}

function dedupe(models: (ListedModel | null)[]): ListedModel[] {
  const seen = new Set<string>()
  const out: ListedModel[] = []
  for (const m of models) {
    if (m && !seen.has(m.id)) {
      seen.add(m.id)
      out.push(m)
    }
  }
  return out
}

type Parser = (json: unknown) => ListedModel[]

const parseOpenAiStyle =
  (providerId: ProviderId): Parser =>
  (json) =>
    dedupe(rows(json).map((m) => (m.active === false ? null : listed(providerId, m.id, undefined))))

const parseAnthropic: Parser = (json) =>
  dedupe(
    rows(json).map((m) => {
      const c = isObj(m.capabilities) ? m.capabilities : null
      const supported = (key: string) => (c && isObj(c[key]) ? (c[key] as Json).supported === true : undefined)
      const reported: ModelCaps = {}
      const vision = supported('image_input')
      const structured = supported('structured_outputs')
      if (vision !== undefined) reported.vision = vision
      if (structured !== undefined) reported.structured = structured
      return listed('anthropic', m.id, m.display_name, reported)
    }),
  )

const parseGoogle: Parser = (json) =>
  dedupe(
    rows(json).map((m) => {
      const methods = strArr(m.supportedGenerationMethods)
      // Embedding / AQA / count-only models are not usable for any feature
      const usable = ['generateContent', 'bidiGenerateContent', 'predict', 'predictLongRunning']
      if (methods.length > 0 && !methods.some((x) => usable.includes(x))) return null
      const reported: ModelCaps = {}
      if (methods.length > 0) {
        reported.language = methods.includes('generateContent')
        if (methods.includes('bidiGenerateContent')) reported.realtime = true
      }
      const name = typeof m.name === 'string' ? m.name.replace(/^models\//, '') : undefined
      return listed('google', name, m.displayName, reported)
    }),
  )

const parseOpenRouter: Parser = (json) =>
  dedupe(
    rows(json).map((m) => {
      const arch = isObj(m.architecture) ? m.architecture : null
      const inputs = strArr(arch?.input_modalities)
      const outputs = strArr(arch?.output_modalities)
      const params = strArr(m.supported_parameters)
      const reported: ModelCaps = {}
      if (inputs.length) reported.vision = inputs.includes('image')
      if (outputs.length) {
        reported.language = outputs.includes('text')
        reported.image = outputs.includes('image')
      }
      if (params.length) {
        reported.tools = params.includes('tools')
        reported.structured = params.includes('structured_outputs') || params.includes('response_format')
      }
      return listed('openrouter', m.id, m.name, reported)
    }),
  )

const parseMistral: Parser = (json) =>
  dedupe(
    rows(json).map((m) => {
      if (m.archived === true) return null
      const c = isObj(m.capabilities) ? m.capabilities : null
      const reported: ModelCaps = {}
      if (c) {
        if (typeof c.completion_chat === 'boolean') reported.language = c.completion_chat
        if (typeof c.function_calling === 'boolean') reported.tools = c.function_calling
        if (typeof c.vision === 'boolean') reported.vision = c.vision
      }
      return listed('mistral', m.id, m.name, reported)
    }),
  )

const parseDeepSeek: Parser = (json) =>
  dedupe(
    rows(json).map((m) => {
      const inputs = strArr(m.input_modalities)
      const reported: ModelCaps = {}
      if (inputs.length) reported.vision = inputs.includes('image')
      return listed('deepseek', m.id, m.name, reported)
    }),
  )

// --- per-provider HTTP definitions ------------------------------------------

interface HttpDef {
  headers(apiKey: string): Record<string, string>
  /** Cheapest authenticated call that fails for a bad key. */
  validatePath: string
  modelsPath: string
  parse: Parser
}

const bearer = (apiKey: string) => ({ Authorization: `Bearer ${apiKey}` })

const HTTP: Record<Exclude<ProviderId, 'assemblyai'>, HttpDef> = {
  openai: { headers: bearer, validatePath: '/models', modelsPath: '/models', parse: parseOpenAiStyle('openai') },
  anthropic: {
    headers: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
    validatePath: '/models?limit=1',
    modelsPath: '/models?limit=1000',
    parse: parseAnthropic,
  },
  google: {
    headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),
    validatePath: '/models?pageSize=1',
    modelsPath: '/models?pageSize=1000',
    parse: parseGoogle,
  },
  // /models is browsable without a key; /key answers 401 for a bad one.
  openrouter: { headers: bearer, validatePath: '/key', modelsPath: '/models', parse: parseOpenRouter },
  groq: { headers: bearer, validatePath: '/models', modelsPath: '/models', parse: parseOpenAiStyle('groq') },
  mistral: { headers: bearer, validatePath: '/models', modelsPath: '/models', parse: parseMistral },
  xai: { headers: bearer, validatePath: '/models', modelsPath: '/models', parse: parseOpenAiStyle('xai') },
  deepseek: { headers: bearer, validatePath: '/models', modelsPath: '/models', parse: parseDeepSeek },
}

function validateWith(id: Exclude<ProviderId, 'assemblyai'>) {
  return (apiKey: string) => runValidate(`${providerBaseUrl(id)}${HTTP[id].validatePath}`, HTTP[id].headers(apiKey))
}

function listWith(id: Exclude<ProviderId, 'assemblyai'>) {
  return async (apiKey: string) => {
    const json = await fetchJson(id, `${providerBaseUrl(id)}${HTTP[id].modelsPath}`, HTTP[id].headers(apiKey))
    return HTTP[id].parse(json)
  }
}

// --- instances --------------------------------------------------------------

interface SdkLike {
  languageModel(modelId: string): LanguageModel
  transcriptionModel?(modelId: string): TranscriptionModel
  imageModel?(modelId: string): ImageModel
  experimental_realtime?: { getToken(options: RealtimeTokenOptions): Promise<RealtimeToken> }
}

function unsupported(id: ProviderId, what: string): never {
  throw new AiModelUnsupportedError({ providerId: id, missing: [what] })
}

/** SDK providers throw NoSuchModelError for kinds they do not serve; surface it as our typed error. */
function guarded<T>(id: ProviderId, what: string, build: () => T): T {
  try {
    return build()
  } catch (e) {
    if (e instanceof Error && e.name === 'AI_NoSuchModelError') return unsupported(id, what)
    throw e
  }
}

function instance(id: ProviderId, sdk: SdkLike): ProviderInstance {
  const realtime = sdk.experimental_realtime
  return {
    id,
    languageModel: (modelId) => guarded(id, 'language', () => sdk.languageModel(modelId)),
    transcriptionModel: (modelId) =>
      guarded(id, 'stt', () => (sdk.transcriptionModel ? sdk.transcriptionModel(modelId) : unsupported(id, 'stt'))),
    imageModel: (modelId) =>
      guarded(id, 'image', () => (sdk.imageModel ? sdk.imageModel(modelId) : unsupported(id, 'image'))),
    ...(realtime ? { realtime: { getToken: (options: RealtimeTokenOptions) => realtime.getToken(options) } } : {}),
  }
}

/** AssemblyAI has no AI SDK model; its transcriber calls the REST API with `apiKey` (lib/speech). */
function speechOnly(id: ProviderId): ProviderInstance {
  return {
    id,
    languageModel: () => unsupported(id, 'language'),
    transcriptionModel: () => unsupported(id, 'stt'),
    imageModel: () => unsupported(id, 'image'),
  }
}

// --- registry ---------------------------------------------------------------

// Voices each realtime provider accepts, from the providers' own docs:
// OpenAI Realtime guide; Gemini speech-generation prebuilt voices; xAI voice agent docs.
const OPENAI_VOICES = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'] as const
const XAI_VOICES = ['eve', 'ara', 'rex', 'sal', 'leo'] as const
const GOOGLE_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird',
  'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
] as const

const ASSEMBLYAI_MODELS: ListedModel[] = [
  { id: 'universal-3-5-pro', label: 'Universal-3.5 Pro', caps: { stt: true } },
  { id: 'universal-2', label: 'Universal-2', caps: { stt: true } },
]

function def(
  id: ProviderId,
  host: string,
  rest: Pick<ProviderDef, 'create' | 'validate' | 'listModels'> & { voices?: readonly string[] },
): ProviderDef {
  return { id, label: PROVIDER_LABELS[id], kinds: PROVIDER_KINDS[id], host, ...rest }
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  openai: def('openai', 'api.openai.com', {
    create: (apiKey) => instance('openai', createOpenAI({ apiKey, ...sdkBaseUrl('openai') })),
    validate: validateWith('openai'),
    listModels: listWith('openai'),
    voices: OPENAI_VOICES,
  }),
  anthropic: def('anthropic', 'api.anthropic.com', {
    create: (apiKey) => instance('anthropic', createAnthropic({ apiKey, ...sdkBaseUrl('anthropic') })),
    validate: validateWith('anthropic'),
    listModels: listWith('anthropic'),
  }),
  google: def('google', 'generativelanguage.googleapis.com', {
    create: (apiKey) => instance('google', createGoogle({ apiKey, ...sdkBaseUrl('google') })),
    validate: validateWith('google'),
    listModels: listWith('google'),
    voices: GOOGLE_VOICES,
  }),
  openrouter: def('openrouter', 'openrouter.ai', {
    create: (apiKey) => instance('openrouter', createOpenRouter({ apiKey, ...sdkBaseUrl('openrouter') }) as unknown as SdkLike),
    validate: validateWith('openrouter'),
    listModels: listWith('openrouter'),
  }),
  groq: def('groq', 'api.groq.com', {
    create: (apiKey) => instance('groq', createGroq({ apiKey, ...sdkBaseUrl('groq') })),
    validate: validateWith('groq'),
    listModels: listWith('groq'),
  }),
  mistral: def('mistral', 'api.mistral.ai', {
    create: (apiKey) => instance('mistral', createMistral({ apiKey, ...sdkBaseUrl('mistral') })),
    validate: validateWith('mistral'),
    listModels: listWith('mistral'),
  }),
  xai: def('xai', 'api.x.ai', {
    create: (apiKey) => instance('xai', createXai({ apiKey, ...sdkBaseUrl('xai') })),
    validate: validateWith('xai'),
    listModels: listWith('xai'),
    voices: XAI_VOICES,
  }),
  deepseek: def('deepseek', 'api.deepseek.com', {
    create: (apiKey) => instance('deepseek', createDeepSeek({ apiKey, ...sdkBaseUrl('deepseek') })),
    validate: validateWith('deepseek'),
    listModels: listWith('deepseek'),
  }),
  assemblyai: def('assemblyai', 'api.assemblyai.com', {
    create: () => speechOnly('assemblyai'),
    // The raw key is the whole Authorization value (no "Bearer"). limit=1 keeps it cheap.
    validate: (apiKey) =>
      runValidate(`${providerBaseUrl('assemblyai')}/transcript?limit=1`, { authorization: apiKey }),
    // AssemblyAI exposes no model catalog: two speech models, fixed.
    listModels: async () => ASSEMBLYAI_MODELS.map((m) => ({ ...m })),
  }),
}

export function getProvider(id: ProviderId): ProviderDef {
  return PROVIDERS[id]
}

/** Builds the provider bound to a tenant's decrypted key. */
export function createProviderInstance(id: ProviderId, apiKey: string): ProviderInstance {
  if (!apiKey) throw new AiKeyInvalidError({ providerId: id })
  return PROVIDERS[id].create(apiKey)
}

/** Voices accepted for realtime on this provider, or `[]`. */
export function voicesFor(id: ProviderId): readonly string[] {
  return PROVIDERS[id].voices ?? []
}
