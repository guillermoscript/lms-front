/**
 * Client-safe AI error codes. No imports of server code: client components and
 * `chat-error.ts` import from here, never from `errors.ts` (which loads
 * server-only modules lazily and must stay out of the browser bundle).
 */

export const AI_ERROR_CODES = [
  'ai_not_configured',
  'ai_key_invalid',
  'ai_model_unsupported',
  'ai_quota',
  'ai_provider_error',
] as const

export type AiErrorCode = (typeof AI_ERROR_CODES)[number]

export const AI_ERROR_HTTP_STATUS: Record<AiErrorCode, number> = {
  ai_not_configured: 402,
  ai_key_invalid: 424,
  ai_model_unsupported: 422,
  ai_quota: 429,
  ai_provider_error: 502,
}

export const AI_SETTINGS_PATH = '/dashboard/admin/settings/ai'

export function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === 'string' && (AI_ERROR_CODES as readonly string[]).includes(value)
}
