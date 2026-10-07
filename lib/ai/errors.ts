import type { AiFeature } from './features'
import type { ProviderId } from './provider-ids'
import { AI_ERROR_CODES, AI_ERROR_HTTP_STATUS, AI_SETTINGS_PATH, isAiErrorCode } from './error-codes'
import type { AiErrorCode } from './error-codes'

export { AI_ERROR_CODES, AI_ERROR_HTTP_STATUS, AI_SETTINGS_PATH, isAiErrorCode }
export type { AiErrorCode }

/**
 * Typed AI failures and the one place that maps provider errors to them.
 *
 * Rules:
 * - Nothing here ever carries or echoes a provider response body, a request
 *   header or a key. Errors keep only a code, the provider id and the upstream
 *   HTTP status.
 * - Responses use 402/424/422/429/502, never 401/403: the client auth handlers
 *   treat those as "session expired" and would sign the user out.
 * - SERVER ONLY (it lazily loads the admin client and `redact`). Client code
 *   imports the codes from `./error-codes` instead.
 */

export interface AiErrorInit {
  providerId?: ProviderId
  feature?: AiFeature
  /** HTTP status the provider answered with, when there was one. */
  upstreamStatus?: number
  /** Only for `AiProviderError`: overrides the status-derived transient guess. */
  transient?: boolean
}

export class AiError extends Error {
  readonly code: AiErrorCode
  readonly providerId?: ProviderId
  readonly feature?: AiFeature
  readonly upstreamStatus?: number

  constructor(code: AiErrorCode, message: string, init: AiErrorInit = {}) {
    super(message)
    this.name = 'AiError'
    this.code = code
    this.providerId = init.providerId
    this.feature = init.feature
    this.upstreamStatus = init.upstreamStatus
  }

  get httpStatus(): number {
    return AI_ERROR_HTTP_STATUS[this.code]
  }
}

/** The school has no usable AI configuration for this feature. */
export class AiNotConfiguredError extends AiError {
  readonly reason: 'no_key' | 'no_model' | 'provider_not_allowed'

  constructor(reason: 'no_key' | 'no_model' | 'provider_not_allowed' = 'no_key', init: AiErrorInit = {}) {
    super('ai_not_configured', `AI is not configured (${reason})`, init)
    this.name = 'AiNotConfiguredError'
    this.reason = reason
  }
}

/** The stored key was rejected by the provider (or marked invalid earlier). */
export class AiKeyInvalidError extends AiError {
  constructor(init: AiErrorInit = {}) {
    super('ai_key_invalid', 'The AI provider rejected the configured key', init)
    this.name = 'AiKeyInvalidError'
  }
}

/** The chosen model cannot serve this request (missing, no access, lacks a required capability). */
export class AiModelUnsupportedError extends AiError {
  /** Capabilities the model was required to have and does not. */
  readonly missing: string[]

  constructor(init: AiErrorInit & { missing?: string[] } = {}) {
    super('ai_model_unsupported', 'The configured model cannot be used for this request', init)
    this.name = 'AiModelUnsupportedError'
    this.missing = init.missing ?? []
  }
}

/** Out of credit or rate limited on the school's own provider account. */
export class AiProviderQuotaError extends AiError {
  constructor(init: AiErrorInit = {}) {
    super('ai_quota', "The AI provider's quota or rate limit was reached", init)
    this.name = 'AiProviderQuotaError'
  }
}

/** Anything else that went wrong talking to the provider. */
export class AiProviderError extends AiError {
  /**
   * True only for timeouts, network failures and 408/5xx: worth failing open on,
   * worth retrying. A status-less error is NOT assumed transient (schema-parse
   * failures and bugs in our own code have no status either); the classifier
   * sets `init.transient` when it recognises a timeout / network failure.
   */
  readonly transient: boolean

  constructor(init: AiErrorInit = {}) {
    super('ai_provider_error', 'The AI provider failed to answer', init)
    this.name = 'AiProviderError'
    const s = init.upstreamStatus
    this.transient = init.transient ?? (s !== undefined && (s === 408 || s >= 500))
  }
}

/** `tenant_ai_settings.mode = 'managed'` (platform-billed AI) is reserved and not built yet. */
export class AiPlatformManagedUnavailableError extends AiError {
  constructor(init: AiErrorInit = {}) {
    super('ai_not_configured', 'Platform-managed AI is not available yet', init)
    this.name = 'AiPlatformManagedUnavailableError'
  }
}

export function isAiError(e: unknown): e is AiError {
  return e instanceof AiError
}

/**
 * Genuinely transient failure (timeout, network, 5xx): the one case callers
 * like the lesson verifier may fail open on. Key and quota problems are not.
 */
export function isTransientAiError(e: unknown): boolean {
  const err = classifyProviderError(e)
  return err instanceof AiProviderError && err.transient
}

// --- classification ---------------------------------------------------------

const MAX_DEPTH = 5

/** Walks `cause` / `lastError` / `errors` (the AI SDK's RetryError) collecting every layer. */
function layers(e: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<unknown>()
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > MAX_DEPTH) return
    seen.add(value)
    const rec = value as Record<string, unknown>
    out.push(rec)
    visit(rec.lastError, depth + 1)
    visit(rec.cause, depth + 1)
    if (Array.isArray(rec.errors)) for (const inner of rec.errors) visit(inner, depth + 1)
  }
  visit(e, 0)
  return out
}

function statusOf(rec: Record<string, unknown>): number | undefined {
  // A 401/403 fetching an attachment (private media URL) says nothing about the school's key.
  if (rec.name === 'AI_DownloadError') return undefined
  for (const v of [rec.statusCode, rec.status, (rec.response as Record<string, unknown> | undefined)?.status]) {
    if (typeof v === 'number' && v >= 100 && v < 600) return v
  }
  return undefined
}

/** Lowercased haystack for pattern matching only. Never returned, logged or sent anywhere. */
function textOf(rec: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof rec.message === 'string') parts.push(rec.message)
  if (typeof rec.responseBody === 'string') parts.push(rec.responseBody.slice(0, 2000))
  if (typeof rec.code === 'string') parts.push(rec.code)
  if (rec.data && typeof rec.data === 'object') {
    try {
      parts.push(JSON.stringify(rec.data).slice(0, 2000))
    } catch {
      /* circular: ignore */
    }
  }
  return parts.join(' ').toLowerCase()
}

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
])

/** Timeout / abort / connection failure, as opposed to a bad answer or a bug in our code. */
function isTimeoutOrNetwork(all: Record<string, unknown>[]): boolean {
  return all.some((r) => {
    const name = typeof r.name === 'string' ? r.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') return true
    if (typeof r.code === 'string' && NETWORK_CODES.has(r.code)) return true
    return name === 'TypeError' && typeof r.message === 'string' && /fetch failed|network/i.test(r.message)
  })
}

const QUOTA_RE =
  /insufficient_quota|exceeded your current quota|credit balance is too low|insufficient (?:credits|balance)|out of credits|payment required|billing (?:hard )?limit|resource_exhausted|quota (?:exceeded|exhausted|limit)|exceeded (?:your |the )?(?:\w+ )?quota/
const KEY_RE =
  /api[_ ]key not valid|api_key_invalid|incorrect api key|invalid api key|invalid_api_key|invalid x-api-key|invalid[_ ]authentication|authentication_error|unauthorized|no auth credentials|user not found/
const MODEL_RE =
  /model_not_found|model .{0,80}(?:does not exist|not found|is not supported)|does not have access to (?:the )?model|not have access to model|unknown model|invalid model/

/**
 * Maps whatever a provider call threw to a typed AiError. Unknown shapes become
 * `AiProviderError`. Never reads a key and never copies provider text out.
 */
export function classifyProviderError(e: unknown, ctx: Pick<AiErrorInit, 'providerId' | 'feature'> = {}): AiError {
  if (e instanceof AiError) return e

  const all = layers(e)
  const status = all.map(statusOf).find((s) => s !== undefined)
  const text = all.map(textOf).join(' ')
  const names = all.map((r) => (typeof r.name === 'string' ? r.name : ''))
  const init: AiErrorInit = { ...ctx, upstreamStatus: status }

  // The SDK refused to even build the request: no key reached it.
  if (names.includes('AI_LoadAPIKeyError')) return new AiNotConfiguredError('no_key', init)
  if (names.includes('AI_NoSuchModelError')) return new AiModelUnsupportedError(init)

  // Quota first: Anthropic reports a drained balance as 400, OpenAI as 429/402.
  if (QUOTA_RE.test(text) && status !== 401 && !KEY_RE.test(text)) return new AiProviderQuotaError(init)

  if (status === 401) return new AiKeyInvalidError(init)
  if (status === 403) {
    // "project does not have access to model" is a model problem, not a bad key
    return MODEL_RE.test(text) ? new AiModelUnsupportedError(init) : new AiKeyInvalidError(init)
  }
  // Google, xAI and a few others answer a bad key with 400
  if ((status === 400 || status === undefined) && KEY_RE.test(text)) return new AiKeyInvalidError(init)
  if (status === 404 || ((status === 400 || status === 422) && MODEL_RE.test(text))) {
    return new AiModelUnsupportedError(init)
  }
  if (status === 429) return new AiProviderQuotaError(init)
  // Status-less failures (NoObjectGeneratedError, schema mismatches, our own
  // bugs) stay non-transient; only a timeout / network failure is.
  return new AiProviderError({ ...init, transient: isTimeoutOrNetwork(all) || undefined })
}

/** Does this look like it came from a provider call (as opposed to a bug in our code)? */
function looksProviderOriginated(e: unknown): boolean {
  if (e instanceof AiError) return true
  return layers(e).some((r) => {
    if (statusOf(r) !== undefined) return true
    const name = typeof r.name === 'string' ? r.name : ''
    return name.startsWith('AI_') || name === 'TimeoutError' || name === 'AbortError'
  })
}

// --- HTTP -------------------------------------------------------------------

export interface AiErrorResponseOptions {
  /** Is the caller allowed to fix this (school admin)? Shapes the copy and the link. */
  canConfigure: boolean
  feature: AiFeature
  /** Prefix the settings link with the locale (`/en/dashboard/...`). */
  locale?: string
}

export function aiErrorBody(err: AiError, o: AiErrorResponseOptions) {
  const base = o.locale ? `/${o.locale}${AI_SETTINGS_PATH}` : AI_SETTINGS_PATH
  return {
    error: {
      code: err.code,
      feature: o.feature,
      canConfigure: o.canConfigure,
      settingsUrl: o.canConfigure ? base : null,
    },
  }
}

/** JSON error response for any AI failure. Body: `{error:{code, feature, canConfigure, settingsUrl}}`. */
export function aiErrorResponse(e: unknown, o: AiErrorResponseOptions): Response {
  const err = classifyProviderError(e, { feature: o.feature })
  return Response.json(aiErrorBody(err, o), {
    status: err.httpStatus,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export interface HandleAiErrorOptions extends AiErrorResponseOptions {
  /** With `providerId`, a key_invalid failure flips the stored credential to `invalid`. Comes from auth, never the body. */
  tenantId?: string
  providerId?: ProviderId
  /** Who triggered the call, for the audit row. */
  actorId?: string | null
}

/**
 * Catch-block helper for route handlers: `catch (e) { return handleAiError(e, {...}) }`.
 *
 * - AI / provider failures become the typed JSON response above (and a rejected
 *   key is recorded: credential `status='invalid'` plus an audit row).
 * - Anything else (a bug in our code) is rethrown untouched, so it stays a 500.
 * - Logs only the error name, upstream status and a redacted message.
 */
export async function handleAiError(e: unknown, o: HandleAiErrorOptions): Promise<Response> {
  if (!looksProviderOriginated(e)) throw e

  const err = classifyProviderError(e, { feature: o.feature, providerId: o.providerId })
  const providerId = err.providerId ?? o.providerId

  try {
    const { redact } = await import('./byok/redact-core')
    const raw = e instanceof Error ? e.message : ''
    console.error('[ai]', o.feature, err.code, e instanceof Error ? e.name : typeof e, err.upstreamStatus ?? '-', redact(raw).slice(0, 200))
  } catch {
    console.error('[ai]', o.feature, err.code)
  }

  if (err.code === 'ai_key_invalid' && o.tenantId && providerId) {
    await markCredentialInvalid(o.tenantId, providerId, o.feature, o.actorId ?? null)
  }

  return aiErrorResponse(err, o)
}

/**
 * Mid-stream failure hook (`streamText({ onError })`): `withTenantAi` only sees errors thrown
 * before the stream starts, so a key revoked or drained during streaming is reported here.
 * Logs name/status only, never the message; a rejected key flips the credential to `invalid`.
 */
export async function reportStreamError(
  error: unknown,
  ctx: { feature: AiFeature; tenantId: string; userId: string | null; providerId: ProviderId },
): Promise<void> {
  const err = classifyProviderError(error, { feature: ctx.feature, providerId: ctx.providerId })
  console.error(`[ai] ${ctx.feature} stream error`, err.code, err.upstreamStatus ?? '-')
  if (err.code === 'ai_key_invalid') {
    await markCredentialInvalid(ctx.tenantId, ctx.providerId, ctx.feature, ctx.userId)
  }
}

/** Flips an active credential to `invalid` once, with an audit row. Best effort: never throws. */
export async function markCredentialInvalid(
  tenantId: string,
  providerId: ProviderId,
  feature: AiFeature | null,
  actorId: string | null,
): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('tenant_ai_credentials')
      .update({ status: 'invalid', last_error_code: 'ai_key_invalid' })
      .eq('tenant_id', tenantId)
      .eq('provider', providerId)
      .eq('status', 'active')
      .select('id')
    if (error || !data?.length) return
    await admin.from('tenant_ai_audit').insert({
      tenant_id: tenantId,
      actor: actorId,
      action: 'auto_invalidated',
      provider: providerId,
      feature,
    })
  } catch (inner) {
    console.error('[ai] could not mark credential invalid', inner instanceof Error ? inner.name : typeof inner)
  }
}
