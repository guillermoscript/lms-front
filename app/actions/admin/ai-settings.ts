'use server'

/**
 * BYOK AI settings: a school admin brings their own provider keys and picks
 * which model runs each AI feature.
 *
 * Rules every action here follows:
 * - Admin only (`getUserRole() === 'admin'` in the CURRENT tenant), except
 *   `setCourseTutorModel` (course author or admin) and `getAiConfiguredStatus`
 *   (any staff member, boolean flags only). The tenant id comes from
 *   `getCurrentTenantId()`, never from the arguments.
 * - Writes go through the admin client (the tables have no write grant for
 *   `authenticated`), so every query filters `tenant_id` explicitly and every
 *   returned row is re-checked against it.
 * - The key is never returned, logged or thrown. Responses carry `last4` only;
 *   catch blocks log the error name and a redacted, truncated message.
 * - Every state change leaves a `tenant_ai_audit` row (no key material) and
 *   calls `revalidatePath`.
 * - Keys are validated live against the provider BEFORE anything is stored.
 */

import { revalidatePath } from 'next/cache'
import { generateText, Output, tool } from 'ai'
import { z } from 'zod'

import { decryptKey, encryptKey, getActiveKeyVersion, ByokCryptoError } from '@/lib/ai/byok/crypto'
import { redact } from '@/lib/ai/byok/redact'
import {
  checkFeatureModel,
  inferModelCaps,
  mergeCaps,
  type Cap,
  type ModelCaps,
} from '@/lib/ai/capabilities'
import {
  AiModelUnsupportedError,
  classifyProviderError,
  markCredentialInvalid,
  type AiErrorCode,
} from '@/lib/ai/errors'
import {
  AI_FEATURES,
  AI_FEATURE_IDS,
  featureAllowsProvider,
  featureProviderKind,
  isAiFeature,
  providersForFeature,
  type AiFeature,
  type AiFeatureKind,
} from '@/lib/ai/features'
import { PROVIDER_IDS, PROVIDER_KINDS, PROVIDER_LABELS, isProviderId, type ProviderId } from '@/lib/ai/provider-ids'
import { PROVIDERS, type ListedModel } from '@/lib/ai/providers'
import { createTenantAi, isAiConfigured } from '@/lib/ai/tenant-ai'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

// --- public types ------------------------------------------------------------

export type AiActionError =
  | 'unauthorized'
  | 'invalid_input'
  | 'rate_limited'
  | 'key_rejected'
  | 'provider_unreachable'
  | 'not_found'
  | 'no_credential'
  | 'provider_not_allowed'
  | 'model_blocked'
  | 'invalid_voice'
  | 'server_misconfigured'
  | 'save_failed'
  | 'ai_failed'

export interface AiActionFailure {
  ok: false
  error: AiActionError
  /** `testFeature` only: the typed AI failure (`ai_key_invalid`, `ai_model_unsupported`, ...). */
  code?: AiErrorCode
  /** `model_blocked` only: why the model cannot serve the feature. */
  reason?: string
}

export type AiActionResult<T extends object = object> = ({ ok: true } & T) | AiActionFailure

/** Soft findings that do not stop a save but the UI should show. */
export type AiSettingsWarning =
  | `missing_cap:${Cap}`
  | 'model_not_in_list'
  | 'key_invalid'
  | 'not_a_language_model'

export interface AiModelOption {
  id: string
  label?: string
  caps?: ModelCaps
}

export interface AiProviderDTO {
  provider: ProviderId
  label: string
  kinds: readonly string[]
  voices: readonly string[]
  connected: boolean
  status: 'active' | 'invalid' | 'disabled' | null
  /** Only the last four characters of the stored key. */
  last4: string | null
  validatedAt: string | null
  lastErrorCode: string | null
  lastUsedAt: string | null
  models: AiModelOption[] | null
  modelsCachedAt: string | null
}

export interface AiFeatureDTO {
  feature: AiFeature
  kind: AiFeatureKind
  area: 'student' | 'teacher' | 'admin'
  longRunning: boolean
  inherits: AiFeature | null
  allowedProviders: ProviderId[]
  mapping: { provider: ProviderId; model: string; params: Record<string, unknown> } | null
}

export interface AiAuditDTO {
  action: string
  provider: string | null
  feature: string | null
  at: string
  actorIsMe: boolean
}

export interface AiSettingsDTO {
  mode: 'byok' | 'managed'
  /** True when at least one provider has an active key. */
  configured: boolean
  defaultModel: { provider: ProviderId; model: string } | null
  traceContent: boolean
  providers: AiProviderDTO[]
  features: AiFeatureDTO[]
  recentAudit: AiAuditDTO[]
}

// --- internals ---------------------------------------------------------------

const SETTINGS_PATH = '/dashboard/admin/settings/ai'

/** Saving a key: 5 per minute per tenant+user (spec). */
const SAVE_KEY_PER_MINUTE = 5
/** Anything else that calls a provider (test/refresh/probe): a bit looser. */
const PROBE_PER_MINUTE = 15
/** A generation probe is the only call that spends tokens: keep it tight. */
const FEATURE_PROBE_PER_MINUTE = 8

const saveKeyLimiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 1000 })
const probeLimiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 2000 })
const featureProbeLimiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 2000 })

const PROBE_TIMEOUT_MS = 25_000
const MAX_MODEL_ID = 200
const MAX_PARAMS_BYTES = 2048

const providerSchema = z.enum(PROVIDER_IDS)

/** Printable ASCII with no spaces: every real provider key. Also rules out header injection. */
const apiKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(512)
  .regex(/^[\x21-\x7E]+$/)

const modelIdSchema = z.string().trim().min(1).max(MAX_MODEL_ID)

const featureSchema = z.string().refine(isAiFeature)

/** Per-feature knobs. Strict: nothing else is stored or read back. */
const paramsSchema = z
  .object({
    voice: z.string().trim().min(1).max(64).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict()

const courseIdSchema = z.coerce.number().int().positive()

const fail = (error: AiActionError, extra: Partial<AiActionFailure> = {}): AiActionFailure => ({
  ok: false,
  error,
  ...extra,
})

function logFailure(what: string, e: unknown) {
  // Name + redacted/truncated message only. DB and crypto errors can carry context we never want in logs.
  const name = e instanceof Error ? e.name : typeof e
  const message = e instanceof Error ? redact(e.message).slice(0, 200) : ''
  console.error(`[ai-settings] ${what}`, name, message)
}

type AdminDb = ReturnType<typeof createAdminClient>

interface Ctx {
  tenantId: string
  userId: string
  db: AdminDb
}

/** Admin of the current tenant, or null. */
async function requireAdmin(): Promise<Ctx | null> {
  const [role, userId] = await Promise.all([getUserRole(), getCurrentUserId()])
  if (role !== 'admin' || !userId) return null
  const tenantId = await getCurrentTenantId()
  return { tenantId, userId, db: createAdminClient() }
}

async function withinLimit(limiter: typeof saveKeyLimiter, limit: number, ctx: Ctx, bucket: string): Promise<boolean> {
  try {
    await limiter.check(limit, `${bucket}:${ctx.tenantId}:${ctx.userId}`)
    return true
  } catch {
    return false
  }
}

async function audit(
  ctx: Pick<Ctx, 'tenantId' | 'userId' | 'db'>,
  action: 'set' | 'rotate' | 'delete' | 'validate_fail' | 'model_change',
  extra: { provider?: string | null; feature?: string | null } = {},
) {
  try {
    const { error } = await ctx.db.from('tenant_ai_audit').insert({
      tenant_id: ctx.tenantId,
      actor: ctx.userId,
      action,
      provider: extra.provider ?? null,
      feature: extra.feature ?? null,
    })
    if (error) logFailure('audit insert failed', new Error('db_error'))
  } catch (e) {
    logFailure('audit insert failed', e)
  }
}

function revalidate() {
  revalidatePath(SETTINGS_PATH)
  revalidatePath('/dashboard/admin')
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function parseModelsCache(raw: unknown): AiModelOption[] | null {
  if (!Array.isArray(raw)) return null
  const out: AiModelOption[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    out.push({
      id: entry.id,
      ...(typeof entry.label === 'string' ? { label: entry.label } : {}),
      ...(isRecord(entry.caps) ? { caps: entry.caps as ModelCaps } : {}),
    })
  }
  return out
}

const toCacheJson = (models: ListedModel[]) =>
  models.map((m) => ({
    id: m.id,
    ...(m.label ? { label: m.label } : {}),
    ...(m.caps ? { caps: m.caps } : {}),
  }))

interface CredentialMeta {
  provider: string
  status: string
  models_cache: unknown
}

/** Credential row WITHOUT ciphertext: enough to know it exists and what models it exposes. */
async function loadCredentialMeta(ctx: Ctx, provider: ProviderId): Promise<CredentialMeta | null> {
  const { data, error } = await ctx.db
    .from('tenant_ai_credentials')
    .select('tenant_id, provider, status, models_cache')
    .eq('tenant_id', ctx.tenantId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw new Error('credential lookup failed')
  if (!data || data.tenant_id !== ctx.tenantId) return null
  return data
}

type KeyRead =
  | { kind: 'ok'; apiKey: string }
  | { kind: 'missing' }
  | { kind: 'undecryptable' }

/** Decrypts the stored key for a tenant+provider. The plaintext never leaves the calling function. */
async function readStoredKey(ctx: Ctx, provider: ProviderId): Promise<KeyRead> {
  const { data, error } = await ctx.db
    .from('tenant_ai_credentials')
    .select('tenant_id, provider, key_ciphertext')
    .eq('tenant_id', ctx.tenantId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw new Error('credential lookup failed')
  if (!data || data.tenant_id !== ctx.tenantId || data.provider !== provider) return { kind: 'missing' }
  try {
    return { kind: 'ok', apiKey: decryptKey(data.key_ciphertext, { tenantId: ctx.tenantId, provider }) }
  } catch (e) {
    if (e instanceof ByokCryptoError && (e.code === 'config_missing' || e.code === 'config_invalid')) throw e
    logFailure('stored key could not be decrypted', e)
    return { kind: 'undecryptable' }
  }
}

/** Provider said "bad key" (as opposed to "I could not be reached" or "slow down"). */
const isRejection = (status: number | undefined) => status === 400 || status === 401 || status === 403

function capsOf(meta: CredentialMeta | null, provider: ProviderId, model: string): ModelCaps {
  const cached = parseModelsCache(meta?.models_cache)?.find((m) => m.id === model)
  return mergeCaps(inferModelCaps(provider, model), cached?.caps)
}

/** Unwraps `ByokCryptoError` config problems into one failure; rethrows anything else. */
function asFailure(e: unknown): AiActionFailure | null {
  if (e instanceof ByokCryptoError && (e.code === 'config_missing' || e.code === 'config_invalid')) {
    logFailure('encryption keys are not configured', e)
    return fail('server_misconfigured')
  }
  return null
}

// --- saveAiCredential --------------------------------------------------------

/**
 * Validate the key live, then (and only then) encrypt and store it. Replaces an
 * existing key for the provider (audited as `rotate`). Returns the last four
 * characters and the key's model list, never the key.
 */
export async function saveAiCredential(input: {
  provider: string
  apiKey: string
}): Promise<AiActionResult<{ last4: string; models?: AiModelOption[] }>> {
  const ctx = await requireAdmin()
  if (!ctx) return fail('unauthorized')

  const parsed = z.object({ provider: providerSchema, apiKey: apiKeySchema }).safeParse(input)
  if (!parsed.success) return fail('invalid_input')
  const { provider, apiKey } = parsed.data

  if (!(await withinLimit(saveKeyLimiter, SAVE_KEY_PER_MINUTE, ctx, 'save'))) return fail('rate_limited')

  try {
    const check = await PROVIDERS[provider].validate(apiKey)
    if (!check.ok) {
      await audit(ctx, 'validate_fail', { provider })
      return fail(isRejection(check.status) ? 'key_rejected' : 'provider_unreachable')
    }

    const { data: existing, error: lookupError } = await ctx.db
      .from('tenant_ai_credentials')
      .select('id, tenant_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('provider', provider)
      .maybeSingle()
    if (lookupError) throw new Error('credential lookup failed')
    const isRotation = !!existing && existing.tenant_id === ctx.tenantId

    // Model list is best effort: a key that validates but cannot list is still a usable key.
    let models: ListedModel[] | undefined
    try {
      models = await PROVIDERS[provider].listModels(apiKey)
    } catch (e) {
      logFailure('model listing after save failed', e)
    }

    const now = new Date().toISOString()
    const values = {
      key_ciphertext: encryptKey(apiKey, { tenantId: ctx.tenantId, provider }),
      key_version: getActiveKeyVersion(),
      key_last4: apiKey.slice(-4),
      status: 'active',
      validated_at: now,
      last_error_code: null,
      models_cache: models ? toCacheJson(models) : null,
      models_cached_at: models ? now : null,
    }

    const { error: writeError } = isRotation
      ? await ctx.db
          .from('tenant_ai_credentials')
          .update(values)
          .eq('tenant_id', ctx.tenantId)
          .eq('provider', provider)
      : await ctx.db
          .from('tenant_ai_credentials')
          .insert({ ...values, tenant_id: ctx.tenantId, provider, created_by: ctx.userId })
    if (writeError) throw new Error('credential write failed')

    await audit(ctx, isRotation ? 'rotate' : 'set', { provider })
    revalidate()
    return { ok: true, last4: values.key_last4, ...(models ? { models: parseModelsCache(toCacheJson(models)) ?? [] } : {}) }
  } catch (e) {
    const known = asFailure(e)
    if (known) return known
    logFailure('saveAiCredential failed', e)
    return fail('save_failed')
  }
}

// --- removeAiCredential --------------------------------------------------------

/**
 * Deletes the provider's key and clears everything that pointed at it (tenant
 * default, per-feature mappings, per-course Aristotle models), so nothing keeps
 * naming a provider the school can no longer call. Reports what was cleared.
 */
export async function removeAiCredential(
  provider: string,
): Promise<AiActionResult<{ cleared: { default: boolean; features: string[]; courses: number } }>> {
  const ctx = await requireAdmin()
  if (!ctx) return fail('unauthorized')
  const parsed = providerSchema.safeParse(provider)
  if (!parsed.success) return fail('invalid_input')
  const id = parsed.data

  try {
    const { data: removed, error } = await ctx.db
      .from('tenant_ai_credentials')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('provider', id)
      .select('id')
    if (error) throw new Error('credential delete failed')
    if (!removed?.length) return fail('not_found')

    const cleared = { default: false, features: [] as string[], courses: 0 }

    const { data: defaults } = await ctx.db
      .from('tenant_ai_settings')
      .update({ default_provider: null, default_model: null })
      .eq('tenant_id', ctx.tenantId)
      .eq('default_provider', id)
      .select('tenant_id')
    cleared.default = !!defaults?.length

    const { data: features } = await ctx.db
      .from('tenant_ai_feature_models')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('provider', id)
      .select('feature')
    cleared.features = (features ?? []).map((r) => r.feature)

    const { data: courses } = await ctx.db
      .from('course_ai_tutors')
      .update({ provider: null, model: null })
      .eq('tenant_id', ctx.tenantId)
      .eq('provider', id)
      .select('course_id')
    cleared.courses = courses?.length ?? 0

    await audit(ctx, 'delete', { provider: id })
    if (cleared.default || cleared.features.length || cleared.courses) {
      await audit(ctx, 'model_change', { provider: id })
    }
    revalidate()
    return { ok: true, cleared }
  } catch (e) {
    logFailure('removeAiCredential failed', e)
    return fail('save_failed')
  }
}

// --- testAiCredential ----------------------------------------------------------

type Revalidation = 'ok' | 'rejected' | 'unreachable' | 'missing'

/**
 * Re-validates the STORED key against the provider and records the outcome:
 * accepted -> active, rejected (or undecryptable) -> invalid. A network failure
 * changes nothing (a flaky provider must not lock a school out).
 */
async function revalidateStoredKey(ctx: Ctx, provider: ProviderId): Promise<Revalidation> {
  const read = await readStoredKey(ctx, provider)
  if (read.kind === 'missing') return 'missing'

  let outcome: Revalidation
  if (read.kind === 'undecryptable') {
    outcome = 'rejected'
  } else {
    const check = await PROVIDERS[provider].validate(read.apiKey)
    outcome = check.ok ? 'ok' : isRejection(check.status) ? 'rejected' : 'unreachable'
  }
  if (outcome === 'unreachable') return outcome

  const patch =
    outcome === 'ok'
      ? { status: 'active', validated_at: new Date().toISOString(), last_error_code: null }
      : { status: 'invalid', last_error_code: 'ai_key_invalid' }
  const q = ctx.db.from('tenant_ai_credentials').update(patch).eq('tenant_id', ctx.tenantId).eq('provider', provider)
  // Never resurrect a key an admin switched off.
  const { error } = await q.neq('status', 'disabled')
  if (error) throw new Error('credential status write failed')
  if (outcome === 'rejected') await audit(ctx, 'validate_fail', { provider })
  return outcome
}

export async function testAiCredential(
  provider: string,
): Promise<AiActionResult<{ status: 'active' }>> {
  const ctx = await requireAdmin()
  if (!ctx) return fail('unauthorized')
  const parsed = providerSchema.safeParse(provider)
  if (!parsed.success) return fail('invalid_input')
  if (!(await withinLimit(probeLimiter, PROBE_PER_MINUTE, ctx, 'probe'))) return fail('rate_limited')

  try {
    const outcome = await revalidateStoredKey(ctx, parsed.data)
    revalidate()
    if (outcome === 'ok') return { ok: true, status: 'active' }
    if (outcome === 'missing') return fail('not_found')
    return fail(outcome === 'rejected' ? 'key_rejected' : 'provider_unreachable')
  } catch (e) {
    const known = asFailure(e)
    if (known) return known
    logFailure('testAiCredential failed', e)
    return fail('save_failed')
  }
}

// --- refreshProviderModels -----------------------------------------------------

export async function refreshProviderModels(
  provider: string,
): Promise<AiActionResult<{ models: AiModelOption[] }>> {
  const ctx = await requireAdmin()
  if (!ctx) return fail('unauthorized')
  const parsed = providerSchema.safeParse(provider)
  if (!parsed.success) return fail('invalid_input')
  const id = parsed.data
  if (!(await withinLimit(probeLimiter, PROBE_PER_MINUTE, ctx, 'probe'))) return fail('rate_limited')

  try {
    const read = await readStoredKey(ctx, id)
    if (read.kind === 'missing') return fail('not_found')
    if (read.kind === 'undecryptable') return fail('key_rejected')

    let models: ListedModel[]
    try {
      models = await PROVIDERS[id].listModels(read.apiKey)
    } catch (e) {
      const err = classifyProviderError(e, { providerId: id })
      if (err.code === 'ai_key_invalid') {
        await markCredentialInvalid(ctx.tenantId, id, null, ctx.userId)
        revalidate()
        return fail('key_rejected')
      }
      logFailure('model listing failed', e)
      return fail('provider_unreachable')
    }

    const cache = toCacheJson(models)
    const { error } = await ctx.db
      .from('tenant_ai_credentials')
      .update({ models_cache: cache, models_cached_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenantId)
      .eq('provider', id)
    if (error) throw new Error('models cache write failed')

    revalidate()
    return { ok: true, models: parseModelsCache(cache) ?? [] }
  } catch (e) {
    const known = asFailure(e)
    if (known) return known
    logFailure('refreshProviderModels failed', e)
    return fail('save_failed')
  }
}

// --- model selection ---------------------------------------------------------

interface ModelChoiceCheck {
  warnings: AiSettingsWarning[]
}

/**
 * Shared by default / feature / course-tutor saves. The provider must have a
 * credential (not disabled); soft findings come back as warnings.
 */
async function vetModelChoice(
  ctx: Ctx,
  feature: AiFeature | null,
  provider: ProviderId,
  model: string,
): Promise<AiActionFailure | ModelChoiceCheck> {
  const meta = await loadCredentialMeta(ctx, provider)
  if (!meta || meta.status === 'disabled') return fail('no_credential')

  const warnings: AiSettingsWarning[] = []
  if (meta.status === 'invalid') warnings.push('key_invalid')

  const cache = parseModelsCache(meta.models_cache)
  if (cache?.length && !cache.some((m) => m.id === model)) warnings.push('model_not_in_list')

  const caps = capsOf(meta, provider, model)
  if (feature) {
    const result = checkFeatureModel(feature, provider, model, caps)
    if (result.blocked) {
      return fail(result.reason === 'provider_not_allowed' ? 'provider_not_allowed' : 'model_blocked', {
        reason: result.reason,
      })
    }
    for (const cap of result.missing) warnings.push(`missing_cap:${cap}`)
  } else if (caps.language !== true) {
    warnings.push('not_a_language_model')
  }
  return { warnings }
}

const isFailure = (v: AiActionFailure | ModelChoiceCheck): v is AiActionFailure => 'ok' in v

// --- setAiDefault ----------------------------------------------------------------

/** The school-wide default model every unmapped language feature falls back to. Both null clears it. */
export async function setAiDefault(input: {
  provider: string | null
  model: string | null
}): Promise<AiActionResult<{ warnings: AiSettingsWarning[] }>> {
  const ctx = await requireAdmin()
  if (!ctx) return fail('unauthorized')

  const parsed = z
    .union([
      z.object({ provider: providerSchema, model: modelIdSchema }),
      z.object({ provider: z.null(), model: z.null() }),
    ])
    .safeParse(input)
  if (!parsed.success) return fail('invalid_input')
  const { provider, model } = parsed.data

  try {
    let warnings: AiSettingsWarning[] = []
    if (provider !== null) {
      if (!PROVIDER_KINDS[provider].includes('language')) return fail('provider_not_allowed')
      const vetted = await vetModelChoice(ctx, null, provider, model)
      if (isFailure(vetted)) return vetted
      warnings = vetted.warnings
    }

    // Columns left out (mode, ai_trace_content) keep their value on conflict.
    const { error } = await ctx.db
      .from('tenant_ai_settings')
      .upsert({ tenant_id: ctx.tenantId, default_provider: provider, default_model: model }, { onConflict: 'tenant_id' })
    if (error) throw new Error('settings write failed')

    await audit(ctx, 'model_change', { provider })
    revalidate()
    return { ok: true, warnings }
  } catch (e) {
    logFailure('setAiDefault failed', e)
    return fail('save_failed')
  }
}

// --- setAiTraceContent -----------------------------------------------------------

/**
 * Whether Langfuse traces of this school's AI calls may carry prompt and
 * completion text. Off keeps the trace (tokens, latency, model, errors) and
 * drops the text before export (lib/ai/trace-content-guard.ts). Takes effect
 * within a minute. Columns left out keep their value on conflict.
 */
export async function setAiTraceContent(enabled: boolean): Promise<AiActionResult<{ enabled: boolean }>> {
  const ctx = await requireAdmin()
  if (!ctx) return fail('unauthorized')
  if (typeof enabled !== 'boolean') return fail('invalid_input')

  try {
    const { error } = await ctx.db
      .from('tenant_ai_settings')
      .upsert({ tenant_id: ctx.tenantId, ai_trace_content: enabled }, { onConflict: 'tenant_id' })
    if (error) throw new Error('settings write failed')
    revalidate()
    return { ok: true, enabled }
  } catch (e) {
    logFailure('setAiTraceContent failed', e)
    return fail('save_failed')
  }
}

// --- setFeatureModel -------------------------------------------------------------

/**
 * Pins a model for one feature. Both `provider` and `model` null removes the
 * override (the feature falls back to its parent, then the school default).
 */
export async function setFeatureModel(input: {
  feature: string
  provider: string | null
  model: string | null
  params?: Record<string, unknown>
}): Promise<AiActionResult<{ warnings: AiSettingsWarning[] }>> {
  const ctx = await requireAdmin()
  if (!ctx) return fail('unauthorized')

  const parsed = z
    .object({
      feature: featureSchema,
      pick: z.union([
        z.object({ provider: providerSchema, model: modelIdSchema }),
        z.object({ provider: z.null(), model: z.null() }),
      ]),
      params: paramsSchema.optional(),
    })
    .safeParse({
      feature: input?.feature,
      pick: { provider: input?.provider, model: input?.model },
      params: input?.params,
    })
  if (!parsed.success) return fail('invalid_input')
  const feature = parsed.data.feature as AiFeature
  const { provider, model } = parsed.data.pick
  const params = parsed.data.params ?? {}
  if (JSON.stringify(params).length > MAX_PARAMS_BYTES) return fail('invalid_input')

  try {
    if (provider === null) {
      const { error } = await ctx.db
        .from('tenant_ai_feature_models')
        .delete()
        .eq('tenant_id', ctx.tenantId)
        .eq('feature', feature)
      if (error) throw new Error('feature mapping delete failed')
      await audit(ctx, 'model_change', { feature })
      revalidate()
      return { ok: true, warnings: [] }
    }

    if (!featureAllowsProvider(feature, provider)) return fail('provider_not_allowed')

    // Voices differ per provider: refuse one the provider does not have (realtime only).
    if (params.voice !== undefined) {
      const voices = PROVIDERS[provider].voices ?? []
      if (featureProviderKind(feature) !== 'realtime' || !voices.includes(params.voice)) return fail('invalid_voice')
    }

    const vetted = await vetModelChoice(ctx, feature, provider, model)
    if (isFailure(vetted)) return vetted

    const { error } = await ctx.db.from('tenant_ai_feature_models').upsert(
      {
        tenant_id: ctx.tenantId,
        feature,
        provider,
        model,
        params,
        updated_by: ctx.userId,
      },
      { onConflict: 'tenant_id,feature' },
    )
    if (error) throw new Error('feature mapping write failed')

    await audit(ctx, 'model_change', { provider, feature })
    revalidate()
    return { ok: true, warnings: vetted.warnings }
  } catch (e) {
    logFailure('setFeatureModel failed', e)
    return fail('save_failed')
  }
}

// --- testFeature -----------------------------------------------------------------

export type FeatureProbe = 'text' | 'tools' | 'structured' | 'credential' | 'realtime_token'

export interface FeatureTestResult {
  feature: AiFeature
  providerId: ProviderId
  modelId: string
  probe: FeatureProbe
  latencyMs: number
}

const pingTool = tool({
  description: 'Connectivity check. Call it once with value "ok".',
  inputSchema: z.object({ value: z.string() }),
})

/**
 * Runs the cheapest call that proves the feature works with the school's
 * CURRENT mapping: a tiny generation (tools / structured output when the
 * feature needs them), a token mint for realtime, a key re-check for speech
 * and images (a transcription or image would cost real money). Failures are
 * classified into the same typed codes the product uses (`code`).
 */
export async function testFeature(feature: string): Promise<AiActionResult<FeatureTestResult>> {
  const ctx = await requireAdmin()
  if (!ctx) return fail('unauthorized')
  if (!isAiFeature(feature)) return fail('invalid_input')
  if (!(await withinLimit(featureProbeLimiter, FEATURE_PROBE_PER_MINUTE, ctx, 'feature'))) return fail('rate_limited')

  const def = AI_FEATURES[feature]
  const ai = createTenantAi(ctx.tenantId, { actorId: ctx.userId })
  const started = Date.now()

  try {
    let result: Omit<FeatureTestResult, 'latencyMs'>

    if (def.kind === 'stt' || def.kind === 'image') {
      const resolved = def.kind === 'stt' ? await ai.getTranscriber() : await ai.getImageModel()
      const outcome = await revalidateStoredKey(ctx, resolved.providerId)
      if (outcome !== 'ok') {
        revalidate()
        return fail('ai_failed', { code: outcome === 'rejected' ? 'ai_key_invalid' : 'ai_provider_error' })
      }
      result = { feature, providerId: resolved.providerId, modelId: resolved.modelId, probe: 'credential' }
    } else if (def.kind === 'realtime') {
      const rt = await ai.getRealtime('voice_conversation')
      await rt.getToken() // the ephemeral token is dropped on the floor
      result = { feature, providerId: rt.providerId, modelId: rt.modelId, probe: 'realtime_token' }
    } else {
      const { model, providerId, modelId } = await ai.getModelForFeature(feature)
      const abortSignal = AbortSignal.timeout(PROBE_TIMEOUT_MS)
      let probe: FeatureProbe
      if (def.needs?.tools) {
        const out = await generateText({
          model,
          prompt: 'Call the ping tool once with the value "ok".',
          tools: { ping: pingTool },
          toolChoice: 'required',
          maxOutputTokens: 256,
          maxRetries: 0,
          abortSignal,
        })
        if (!out.toolCalls?.length) throw new AiModelUnsupportedError({ providerId, feature, missing: ['tools'] })
        probe = 'tools'
      } else if (def.needs?.structured || def.kind === 'object') {
        const out = await generateText({
          model,
          prompt: 'Return ok set to true.',
          output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
          maxOutputTokens: 256,
          maxRetries: 0,
          abortSignal,
        })
        try {
          if (out.output?.ok !== true) throw new Error('unexpected structured output')
        } catch {
          // The model answered but not in the requested shape: it cannot serve this feature.
          throw new AiModelUnsupportedError({ providerId, feature, missing: ['structured'] })
        }
        probe = 'structured'
      } else {
        await generateText({
          model,
          prompt: 'Reply with the single word: ok',
          maxOutputTokens: 32,
          maxRetries: 0,
          abortSignal,
        })
        probe = 'text'
      }
      result = { feature, providerId, modelId, probe }
    }

    return { ok: true, ...result, latencyMs: Date.now() - started }
  } catch (e) {
    const known = asFailure(e)
    if (known) return known
    const providerId = ai.lastProviderId()
    const err = classifyProviderError(e, { feature, providerId })
    if (err.code === 'ai_key_invalid' && (err.providerId ?? providerId)) {
      // The resolver's own wrappers invalidate for speech/realtime; do the same for generation probes.
      await markCredentialInvalid(ctx.tenantId, (err.providerId ?? providerId)!, feature, ctx.userId)
      revalidate()
    }
    logFailure(`testFeature(${feature}) -> ${err.code}`, e)
    return fail('ai_failed', { code: err.code })
  }
}

// --- setCourseTutorModel -----------------------------------------------------------

/**
 * Per-course Aristotle model (resolution step 1). Course author or school
 * admin. Both `provider` and `model` omitted/null clears the override.
 */
export async function setCourseTutorModel(input: {
  courseId: number | string
  provider?: string | null
  model?: string | null
}): Promise<AiActionResult<{ warnings: AiSettingsWarning[] }>> {
  const [role, userId] = await Promise.all([getUserRole(), getCurrentUserId()])
  if ((role !== 'admin' && role !== 'teacher') || !userId) return fail('unauthorized')
  const tenantId = await getCurrentTenantId()
  const ctx: Ctx = { tenantId, userId, db: createAdminClient() }

  const parsed = z
    .object({
      courseId: courseIdSchema,
      pick: z.union([
        z.object({ provider: providerSchema, model: modelIdSchema }),
        z.object({ provider: z.null(), model: z.null() }),
      ]),
    })
    .safeParse({
      courseId: input?.courseId,
      pick: { provider: input?.provider ?? null, model: input?.model ?? null },
    })
  if (!parsed.success) return fail('invalid_input')
  const { courseId } = parsed.data
  const { provider, model } = parsed.data.pick

  try {
    // Ownership first: the admin client bypasses RLS, so this IS the access check.
    const { data: course, error: courseError } = await ctx.db
      .from('courses')
      .select('course_id, tenant_id, author_id')
      .eq('course_id', courseId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (courseError) throw new Error('course lookup failed')
    if (!course || course.tenant_id !== tenantId) return fail('not_found')
    if (role === 'teacher' && course.author_id !== userId) return fail('unauthorized')

    let warnings: AiSettingsWarning[] = []
    if (provider !== null) {
      if (!featureAllowsProvider('aristotle', provider)) return fail('provider_not_allowed')
      const vetted = await vetModelChoice(ctx, 'aristotle', provider, model)
      if (isFailure(vetted)) return vetted
      warnings = vetted.warnings
    }

    const patch = { provider, model }
    const { data: updated, error: updateError } = await ctx.db
      .from('course_ai_tutors')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('course_id', courseId)
      .select('tutor_id')
    if (updateError) throw new Error('course tutor write failed')

    if (!updated?.length && provider !== null) {
      // No Aristotle config yet: create it disabled; the teacher enables it in the same form.
      const { error: insertError } = await ctx.db
        .from('course_ai_tutors')
        .insert({ tenant_id: tenantId, course_id: courseId, enabled: false, ...patch })
      if (insertError) throw new Error('course tutor write failed')
    }

    await audit(ctx, 'model_change', { provider, feature: 'aristotle' })
    revalidatePath(`/dashboard/teacher/courses/${courseId}/settings`)
    revalidate()
    return { ok: true, warnings }
  } catch (e) {
    logFailure('setCourseTutorModel failed', e)
    return fail('save_failed')
  }
}

// --- reads -----------------------------------------------------------------------

/**
 * Everything the settings page needs, masked: last4 and status per provider
 * (all nine, connected or not), the default, each feature's mapping, and the
 * latest audit rows. No ciphertext column is ever selected.
 */
export async function getAiSettingsDTO(): Promise<AiActionResult<{ settings: AiSettingsDTO }>> {
  const ctx = await requireAdmin()
  if (!ctx) return fail('unauthorized')

  try {
    const [credentials, settings, mappings, auditRows] = await Promise.all([
      ctx.db
        .from('tenant_ai_credentials')
        .select('tenant_id, provider, status, key_last4, validated_at, last_error_code, last_used_at, models_cache, models_cached_at')
        .eq('tenant_id', ctx.tenantId),
      ctx.db
        .from('tenant_ai_settings')
        .select('tenant_id, mode, default_provider, default_model, ai_trace_content')
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle(),
      ctx.db
        .from('tenant_ai_feature_models')
        .select('tenant_id, feature, provider, model, params')
        .eq('tenant_id', ctx.tenantId),
      ctx.db
        .from('tenant_ai_audit')
        .select('actor, action, provider, feature, at')
        .eq('tenant_id', ctx.tenantId)
        .order('at', { ascending: false })
        .limit(20),
    ])
    if (credentials.error || settings.error || mappings.error || auditRows.error) {
      throw new Error('settings read failed')
    }

    const credByProvider = new Map<string, NonNullable<typeof credentials.data>[number]>()
    for (const row of credentials.data ?? []) {
      if (row.tenant_id === ctx.tenantId) credByProvider.set(row.provider, row)
    }

    const providers: AiProviderDTO[] = PROVIDER_IDS.map((provider) => {
      const row = credByProvider.get(provider)
      const status = row && (row.status === 'active' || row.status === 'invalid' || row.status === 'disabled') ? row.status : null
      return {
        provider,
        label: PROVIDER_LABELS[provider],
        kinds: PROVIDER_KINDS[provider],
        voices: PROVIDERS[provider].voices ?? [],
        connected: !!row,
        status,
        last4: row?.key_last4 ?? null,
        validatedAt: row?.validated_at ?? null,
        lastErrorCode: row?.last_error_code ?? null,
        lastUsedAt: row?.last_used_at ?? null,
        models: row ? parseModelsCache(row.models_cache) : null,
        modelsCachedAt: row?.models_cached_at ?? null,
      }
    })

    const settingsRow = settings.data && settings.data.tenant_id === ctx.tenantId ? settings.data : null
    const mappingByFeature = new Map<string, NonNullable<typeof mappings.data>[number]>()
    for (const row of mappings.data ?? []) {
      if (row.tenant_id === ctx.tenantId) mappingByFeature.set(row.feature, row)
    }

    const features: AiFeatureDTO[] = AI_FEATURE_IDS.map((feature) => {
      const def = AI_FEATURES[feature]
      const mapped = mappingByFeature.get(feature)
      return {
        feature,
        kind: def.kind,
        area: def.area,
        longRunning: def.longRunning === true,
        inherits: def.inherits ?? null,
        allowedProviders: providersForFeature(feature),
        mapping:
          mapped && isProviderId(mapped.provider)
            ? { provider: mapped.provider, model: mapped.model, params: isRecord(mapped.params) ? mapped.params : {} }
            : null,
      }
    })

    const dto: AiSettingsDTO = {
      mode: settingsRow?.mode === 'managed' ? 'managed' : 'byok',
      configured: providers.some((p) => p.status === 'active'),
      defaultModel:
        settingsRow && isProviderId(settingsRow.default_provider) && settingsRow.default_model
          ? { provider: settingsRow.default_provider, model: settingsRow.default_model }
          : null,
      traceContent: settingsRow?.ai_trace_content ?? true,
      providers,
      features,
      recentAudit: (auditRows.data ?? []).map((a) => ({
        action: a.action,
        provider: a.provider,
        feature: a.feature,
        at: a.at,
        actorIsMe: a.actor === ctx.userId,
      })),
    }
    return { ok: true, settings: dto }
  } catch (e) {
    logFailure('getAiSettingsDTO failed', e)
    return fail('save_failed')
  }
}

/**
 * Read-only "is AI on for this school?" for teachers and admins (boolean per
 * provider, through the `tenant_ai_configured` RPC; never a credential row).
 */
export async function getAiConfiguredStatus(): Promise<AiActionResult<{ configured: Record<string, boolean>; canConfigure: boolean }>> {
  const [role, userId] = await Promise.all([getUserRole(), getCurrentUserId()])
  if ((role !== 'admin' && role !== 'teacher') || !userId) return fail('unauthorized')
  try {
    const tenantId = await getCurrentTenantId()
    const supabase = await createClient()
    return { ok: true, configured: await isAiConfigured(supabase, tenantId), canConfigure: role === 'admin' }
  } catch (e) {
    logFailure('getAiConfiguredStatus failed', e)
    return fail('save_failed')
  }
}
