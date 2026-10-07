import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImageModel, LanguageModel } from 'ai'

import { createAdminClient } from '@/lib/supabase/admin'

import { decryptKey, encryptKey, getActiveKeyVersion, needsReencrypt, ByokCryptoError } from './byok/crypto'
import { inferModelCaps, mergeCaps, missingCaps, type Cap, type ModelCaps } from './capabilities'
import {
  AiKeyInvalidError,
  AiModelUnsupportedError,
  AiNotConfiguredError,
  AiPlatformManagedUnavailableError,
  classifyProviderError,
  markCredentialInvalid,
} from './errors'
import {
  AI_FEATURES,
  featureAllowsProvider,
  featureChain,
  featureProviderKind,
  type AiFeature,
} from './features'
import { isProviderId, type ProviderId } from './provider-ids'
import {
  createProviderInstance,
  voicesFor,
  type ProviderInstance,
  type RealtimeTokenOptions,
} from './providers'
import { transcribeWithProvider, type TenantTranscript, type TranscribeOptions } from './transcription'

/**
 * The one door to a tenant's AI. Everything that calls a model on a school's
 * behalf goes through `createTenantAi(tenantId)`; there is no platform-key
 * fallback anywhere, so a school with no usable key gets a typed error, never
 * someone else's credentials.
 *
 * Rules this file enforces:
 * - `tenantId` is an argument from the caller's auth context, never read from a
 *   request body here. Every query filters by it, and every returned row is
 *   re-checked against it (the admin client bypasses RLS).
 * - Ciphertext is decrypted with AAD = tenantId:provider, so even a row copied
 *   across tenants fails to decrypt.
 * - Keys live only inside the per-request closure. No module-level cache, and
 *   nothing here logs, returns or throws key material.
 *
 * Resolution order for a feature's (provider, model):
 *   1. course_ai_tutors.provider/model (Aristotle features only, needs courseId)
 *   2. tenant_ai_feature_models[feature]
 *   3. the same for each `inherits` ancestor (nearest first)
 *   4. tenant_ai_settings.default_provider/default_model (language features)
 *   5. for stt / realtime / image: a built-in model of the first allowed provider
 *      the school has a key for (see KIND_DEFAULTS)
 *   else AiNotConfiguredError.
 */

// --- types ------------------------------------------------------------------

export type ModelSelection = 'course' | 'feature' | 'inherited' | 'default' | 'kind_default'

export interface ResolvedFeatureModel {
  model: LanguageModel
  providerId: ProviderId
  modelId: string
  feature: AiFeature
  source: 'tenant'
  /** Which resolution step picked the model. */
  selection: ModelSelection
  caps: ModelCaps
  /** `tenant_ai_feature_models.params` for the mapping that matched ({} otherwise). */
  params: Record<string, unknown>
}

export interface TenantTranscriber {
  providerId: ProviderId
  modelId: string
  transcribe(audio: Buffer | Uint8Array | URL, options?: TranscribeOptions): Promise<TenantTranscript>
}

export interface RealtimeSession {
  token: string
  url: string
  model: string
  provider: ProviderId
  voice?: string
  expiresAt?: number
}

export interface TenantRealtime {
  providerId: ProviderId
  modelId: string
  /** Validated against the provider's voice list; undefined = provider default. */
  voice?: string
  getToken(
    sessionConfig?: RealtimeTokenOptions['sessionConfig'],
    options?: { expiresAfterSeconds?: number },
  ): Promise<RealtimeSession>
}

export interface TenantImage {
  model: ImageModel
  providerId: ProviderId
  modelId: string
}

export interface GetModelOptions {
  /** Aristotle: lets `course_ai_tutors` override the tenant's model for this course. */
  courseId?: string | number
  /** Capabilities the request cannot work without (e.g. `vision` when attachments are present). */
  require?: readonly Cap[]
  /** Aristotle: the `course_ai_tutors` provider/model the caller already loaded; skips a second read. */
  courseTutor?: { provider: string | null; model: string | null } | null
}

export interface TenantAiOptions {
  /** Who triggered the call, recorded on the audit row when a key gets auto-invalidated. */
  actorId?: string | null
}

export interface TenantAi {
  readonly tenantId: string
  getModelForFeature(feature: AiFeature, options?: GetModelOptions): Promise<ResolvedFeatureModel>
  getTranscriber(): Promise<TenantTranscriber>
  getRealtime(feature?: 'voice_conversation'): Promise<TenantRealtime>
  getImageModel(): Promise<TenantImage>
  /** Provider behind the most recent resolution (for `handleAiError({providerId})`). */
  lastProviderId(): ProviderId | undefined
}

// --- tuning -----------------------------------------------------------------

/** `last_used_at` is touched at most this often per credential. */
export const LAST_USED_THROTTLE_MS = 10 * 60 * 1000

/**
 * Built-in model per non-language kind when the school mapped nothing: the one
 * known-good id, so "add an OpenAI key" is enough for speech. Providers absent
 * here need an explicit feature mapping. OpenAI's STT default is whisper-1
 * because the newer transcribe models return no word timestamps.
 */
const KIND_DEFAULTS: Partial<Record<'stt' | 'realtime' | 'image', Partial<Record<ProviderId, string>>>> = {
  stt: { assemblyai: 'universal-2', openai: 'whisper-1', groq: 'whisper-large-v3' },
  realtime: { openai: 'gpt-realtime' },
  image: { openai: 'gpt-image-1' },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// --- internal row shapes ----------------------------------------------------

interface SettingsRow {
  tenant_id: string
  mode: string
  default_provider: string | null
  default_model: string | null
}

interface FeatureModelRow {
  tenant_id: string
  feature: string
  provider: string
  model: string
  params: unknown
}

interface CredentialRow {
  tenant_id: string
  provider: string
  key_ciphertext: string
  key_version: number
  status: string
  last_used_at: string | null
  models_cache: unknown
}

interface TenantConfig {
  settings: SettingsRow | null
  featureModels: Map<string, FeatureModelRow>
}

interface Choice {
  providerId: ProviderId
  modelId: string
  selection: ModelSelection
  params: Record<string, unknown>
}

/** What `loadCredential` yields: the live provider and the plaintext key (closure-only). */
interface LoadedCredential {
  providerId: ProviderId
  apiKey: string
  instance: ProviderInstance
  modelsCache: { id: string; caps?: ModelCaps }[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function parseModelsCache(raw: unknown): { id: string; caps?: ModelCaps }[] {
  if (!Array.isArray(raw)) return []
  const out: { id: string; caps?: ModelCaps }[] = []
  for (const entry of raw) {
    if (isRecord(entry) && typeof entry.id === 'string') {
      out.push({ id: entry.id, caps: isRecord(entry.caps) ? (entry.caps as ModelCaps) : undefined })
    }
  }
  return out
}

function logFailure(what: string, e: unknown) {
  // Name only: error messages from the DB layer or crypto can carry context we do not want in logs.
  console.error(`[tenant-ai] ${what}`, e instanceof Error ? e.name : typeof e)
}

// --- the resolver -----------------------------------------------------------

export function createTenantAi(tenantId: string, opts: TenantAiOptions = {}): TenantAi {
  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
    // A caller bug (or an attacker-shaped value): never guess a tenant.
    throw new Error('createTenantAi requires a tenant id from the auth context')
  }

  let admin: ReturnType<typeof createAdminClient> | undefined
  const db = () => (admin ??= createAdminClient())

  let lastProvider: ProviderId | undefined
  let configPromise: Promise<TenantConfig> | undefined
  const tutorPromises = new Map<string, Promise<{ provider: string; model: string } | null>>()
  const credentialPromises = new Map<ProviderId, Promise<LoadedCredential>>()

  // -- config (settings + feature mappings) --

  function loadConfig(): Promise<TenantConfig> {
    return (configPromise ??= (async () => {
      const [settingsRes, featuresRes] = await Promise.all([
        db()
          .from('tenant_ai_settings')
          .select('tenant_id, mode, default_provider, default_model')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        db()
          .from('tenant_ai_feature_models')
          .select('tenant_id, feature, provider, model, params')
          .eq('tenant_id', tenantId),
      ])
      if (settingsRes.error || featuresRes.error) throw new Error('tenant-ai: could not read AI settings')

      const settingsRow = settingsRes.data as SettingsRow | null
      // The admin client bypasses RLS: refuse any row that is not this tenant's.
      const settings = settingsRow && settingsRow.tenant_id === tenantId ? settingsRow : null
      const featureModels = new Map<string, FeatureModelRow>()
      for (const row of (featuresRes.data ?? []) as FeatureModelRow[]) {
        if (row.tenant_id === tenantId) featureModels.set(row.feature, row)
      }
      return { settings, featureModels }
    })())
  }

  function loadCourseTutor(courseId: string | number) {
    const numeric = Number(courseId)
    if (!Number.isInteger(numeric) || numeric <= 0) return Promise.resolve(null)
    const key = String(numeric)
    let p = tutorPromises.get(key)
    if (!p) {
      p = (async () => {
        const { data, error } = await db()
          .from('course_ai_tutors')
          .select('tenant_id, course_id, provider, model')
          .eq('tenant_id', tenantId)
          .eq('course_id', numeric)
          .limit(1)
        if (error) throw new Error('tenant-ai: could not read course tutor')
        const row = ((data ?? []) as { tenant_id: string; provider: string | null; model: string | null }[]).find(
          (r) => r.tenant_id === tenantId,
        )
        return row?.provider && row.model ? { provider: row.provider, model: row.model } : null
      })()
      tutorPromises.set(key, p)
    }
    return p
  }

  // -- credentials --

  function loadCredential(providerId: ProviderId, feature: AiFeature): Promise<LoadedCredential> {
    let p = credentialPromises.get(providerId)
    if (!p) {
      p = readCredential(providerId, feature)
      credentialPromises.set(providerId, p)
      // A failed read must not stay cached for the rest of the request.
      p.catch(() => {
        if (credentialPromises.get(providerId) === p) credentialPromises.delete(providerId)
      })
    }
    return p
  }

  async function readCredential(providerId: ProviderId, feature: AiFeature): Promise<LoadedCredential> {
    const { data, error } = await db()
      .from('tenant_ai_credentials')
      .select('tenant_id, provider, key_ciphertext, key_version, status, last_used_at, models_cache')
      .eq('tenant_id', tenantId)
      .eq('provider', providerId)
      .maybeSingle()
    if (error) throw new Error('tenant-ai: could not read credential')

    const row = data as CredentialRow | null
    if (!row) throw new AiNotConfiguredError('no_key', { providerId, feature })
    if (row.tenant_id !== tenantId || row.provider !== providerId) {
      // Query filters and row disagree: never use it.
      logFailure('credential row did not match the requested tenant/provider', new Error('mismatch'))
      throw new AiNotConfiguredError('no_key', { providerId, feature })
    }
    if (row.status === 'invalid') throw new AiKeyInvalidError({ providerId, feature })
    if (row.status !== 'active') throw new AiNotConfiguredError('no_key', { providerId, feature })

    let apiKey: string
    try {
      apiKey = decryptKey(row.key_ciphertext, { tenantId, provider: providerId })
    } catch (e) {
      // Server misconfiguration (missing master key) is a 500, not the school's fault.
      if (e instanceof ByokCryptoError && (e.code === 'config_missing' || e.code === 'config_invalid')) throw e
      // Wrong AAD, tampering, unknown key version: the stored key is unusable, the admin must re-enter it.
      logFailure('credential could not be decrypted', e)
      throw new AiKeyInvalidError({ providerId, feature })
    }

    reencryptLater(row, providerId, apiKey)
    touchLastUsed(row, providerId)

    return {
      providerId,
      apiKey,
      instance: createProviderInstance(providerId, apiKey),
      modelsCache: parseModelsCache(row.models_cache),
    }
  }

  /** Lazy rotation: rewrite with the active master key. Compare-and-swap on the old envelope; best effort. */
  function reencryptLater(row: CredentialRow, providerId: ProviderId, apiKey: string) {
    try {
      if (!needsReencrypt(row.key_ciphertext)) return
      const next = encryptKey(apiKey, { tenantId, provider: providerId })
      void Promise.resolve(
        db()
          .from('tenant_ai_credentials')
          .update({ key_ciphertext: next, key_version: getActiveKeyVersion() })
          .eq('tenant_id', tenantId)
          .eq('provider', providerId)
          .eq('key_ciphertext', row.key_ciphertext),
      ).catch((e) => logFailure('lazy re-encrypt failed', e))
    } catch (e) {
      logFailure('lazy re-encrypt failed', e)
    }
  }

  /** At most one write per credential per LAST_USED_THROTTLE_MS. Fire and forget. */
  function touchLastUsed(row: CredentialRow, providerId: ProviderId) {
    const last = row.last_used_at ? Date.parse(row.last_used_at) : NaN
    if (Number.isFinite(last) && Date.now() - last < LAST_USED_THROTTLE_MS) return
    void Promise.resolve(
      db()
        .from('tenant_ai_credentials')
        .update({ last_used_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('provider', providerId),
    ).catch((e) => logFailure('last_used_at update failed', e))
  }

  // -- choosing (provider, model) --

  function toChoice(
    feature: AiFeature,
    provider: string | null | undefined,
    model: string | null | undefined,
    selection: ModelSelection,
    params: unknown = {},
  ): Choice | null {
    if (!provider || !model) return null
    // An unknown provider id in the DB means the row is stale or tampered: treat as not allowed.
    if (!isProviderId(provider) || !featureAllowsProvider(feature, provider)) {
      throw new AiNotConfiguredError('provider_not_allowed', { feature, providerId: isProviderId(provider) ? provider : undefined })
    }
    return { providerId: provider, modelId: model, selection, params: isRecord(params) ? params : {} }
  }

  async function choose(
    feature: AiFeature,
    courseId?: string | number,
    knownTutor?: GetModelOptions['courseTutor'],
  ): Promise<Choice> {
    const chain = featureChain(feature)
    const wantsCourseTutor = courseId !== undefined && chain.includes('aristotle')
    // Independent reads: start both before awaiting either.
    const [config, tutor] = await Promise.all([
      loadConfig(),
      wantsCourseTutor ? (knownTutor !== undefined ? knownTutor : loadCourseTutor(courseId)) : null,
    ])
    // Reserved seam: platform-billed AI is not built. Never fall through to a platform key.
    if (config.settings?.mode === 'managed') throw new AiPlatformManagedUnavailableError({ feature })

    // 1. per-course Aristotle override
    if (wantsCourseTutor) {
      const picked = toChoice(feature, tutor?.provider, tutor?.model, 'course')
      if (picked) return picked
    }

    // 2-3. the feature's own mapping, then each inherited ancestor's
    for (const [i, f] of chain.entries()) {
      const row = config.featureModels.get(f)
      const picked = row && toChoice(feature, row.provider, row.model, i === 0 ? 'feature' : 'inherited', row.params)
      if (picked) return picked
    }

    // 4. tenant default (a language model; meaningless for speech/realtime/image)
    const kind = featureProviderKind(feature)
    if (kind === 'language') {
      const d = config.settings
      const picked = toChoice(feature, d?.default_provider, d?.default_model, 'default')
      if (picked) return picked
      throw new AiNotConfiguredError('no_model', { feature })
    }

    // 5. non-language kinds: first allowed provider the school has a key for
    return chooseKindDefault(feature, kind, config)
  }

  async function chooseKindDefault(feature: AiFeature, kind: 'stt' | 'realtime' | 'image', config: TenantConfig): Promise<Choice> {
    const defaults = KIND_DEFAULTS[kind] ?? {}
    const defaultProvider = config.settings?.default_provider
    const preferred = isProviderId(defaultProvider) ? [defaultProvider] : []
    const order = [...preferred, ...(Object.keys(defaults) as ProviderId[])]
    const candidates = [...new Set(order)].filter((p) => defaults[p] && featureAllowsProvider(feature, p))
    let rejected: AiKeyInvalidError | undefined
    for (const providerId of candidates) {
      try {
        await loadCredential(providerId, feature)
      } catch (e) {
        if (e instanceof AiNotConfiguredError) continue // no usable key for this provider: try the next
        if (e instanceof AiKeyInvalidError) {
          rejected ??= e // a bad key must not shadow a good one on another provider
          continue
        }
        throw e
      }
      return { providerId, modelId: defaults[providerId]!, selection: 'kind_default', params: {} }
    }
    // Only bad keys on offer: say so (the admin needs the "replace your key" copy, not "add a key").
    if (rejected) throw rejected
    throw new AiNotConfiguredError(candidates.length ? 'no_key' : 'no_model', { feature })
  }

  function capsFor(cred: LoadedCredential, modelId: string): ModelCaps {
    const cached = cred.modelsCache.find((m) => m.id === modelId)
    return mergeCaps(inferModelCaps(cred.providerId, modelId), cached?.caps)
  }

  /** Auto-invalidates a rejected key, then rethrows the typed error. */
  async function guarded<T>(providerId: ProviderId, feature: AiFeature, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      const err = classifyProviderError(e, { providerId, feature })
      if (err.code === 'ai_key_invalid') {
        await markCredentialInvalid(tenantId, providerId, feature, opts.actorId ?? null)
      }
      throw err
    }
  }

  // -- public API --

  return {
    tenantId,

    lastProviderId: () => lastProvider,

    async getModelForFeature(feature, options = {}) {
      if (!Object.prototype.hasOwnProperty.call(AI_FEATURES, feature)) {
        throw new Error(`tenant-ai: unknown AI feature "${String(feature)}"`)
      }
      if (featureProviderKind(feature) !== 'language') {
        throw new Error(`tenant-ai: "${feature}" is not a language feature; use getTranscriber/getRealtime/getImageModel`)
      }
      const choice = await choose(feature, options.courseId, options.courseTutor)
      lastProvider = choice.providerId
      const cred = await loadCredential(choice.providerId, feature)

      const caps = capsFor(cred, choice.modelId)
      const missing = options.require?.length ? missingCaps(caps, options.require) : []
      if (missing.length) {
        throw new AiModelUnsupportedError({ providerId: choice.providerId, feature, missing })
      }

      return {
        model: cred.instance.languageModel(choice.modelId),
        providerId: choice.providerId,
        modelId: choice.modelId,
        feature,
        source: 'tenant',
        selection: choice.selection,
        caps,
        params: choice.params,
      }
    },

    async getTranscriber() {
      const feature: AiFeature = 'speech_stt'
      const choice = await choose(feature)
      lastProvider = choice.providerId
      const cred = await loadCredential(choice.providerId, feature)
      const { providerId, modelId } = choice
      return {
        providerId,
        modelId,
        transcribe: (audio, options) =>
          guarded(providerId, feature, () =>
            transcribeWithProvider({ providerId, modelId, apiKey: cred.apiKey, instance: cred.instance, audio, options }),
          ),
      }
    },

    async getRealtime(feature = 'voice_conversation') {
      const choice = await choose(feature)
      lastProvider = choice.providerId
      const cred = await loadCredential(choice.providerId, feature)
      const realtime = cred.instance.realtime
      if (!realtime) throw new AiModelUnsupportedError({ providerId: choice.providerId, feature, missing: ['realtime'] })

      const wanted = choice.params.voice
      const voice = typeof wanted === 'string' && voicesFor(choice.providerId).includes(wanted) ? wanted : undefined
      const { providerId, modelId } = choice
      return {
        providerId,
        modelId,
        voice,
        getToken: (sessionConfig, options) =>
          guarded(providerId, feature, async () => {
            const minted = await realtime.getToken({
              model: modelId,
              ...(options?.expiresAfterSeconds ? { expiresAfterSeconds: options.expiresAfterSeconds } : {}),
              sessionConfig: { ...sessionConfig, ...(voice && !sessionConfig?.voice ? { voice } : {}) },
            })
            return {
              token: minted.token,
              url: minted.url,
              expiresAt: minted.expiresAt,
              model: modelId,
              provider: providerId,
              voice: sessionConfig?.voice ?? voice,
            }
          }),
      }
    },

    async getImageModel() {
      const feature: AiFeature = 'image_generation'
      const choice = await choose(feature)
      lastProvider = choice.providerId
      const cred = await loadCredential(choice.providerId, feature)
      return {
        model: cred.instance.imageModel(choice.modelId),
        providerId: choice.providerId,
        modelId: choice.modelId,
      }
    },
  }
}

// --- conveniences ------------------------------------------------------------

/** One-shot form of `createTenantAi(tenantId).getModelForFeature(...)`. */
export function getModelForFeature(ctx: {
  tenantId: string
  feature: AiFeature
  courseId?: string | number
  require?: readonly Cap[]
}): Promise<ResolvedFeatureModel> {
  return createTenantAi(ctx.tenantId).getModelForFeature(ctx.feature, { courseId: ctx.courseId, require: ctx.require })
}

/**
 * UI flags only ("is AI on for this school?"): provider -> true for each ACTIVE
 * key, through the boolean-only `tenant_ai_configured` RPC. Fails closed to `{}`.
 * Uses the caller's RLS client; never reads a credential.
 */
export async function isAiConfigured(
  supabase: Pick<SupabaseClient, 'rpc'>,
  tenantId: string,
): Promise<Record<string, boolean>> {
  const { data, error } = await supabase.rpc('tenant_ai_configured', { _tenant_id: tenantId })
  if (error || !isRecord(data)) return {}
  const out: Record<string, boolean> = {}
  for (const [provider, on] of Object.entries(data)) if (on === true) out[provider] = true
  return out
}
