import 'server-only'

import { getTranslations } from 'next-intl/server'

import { AI_ERROR_CODES, handleAiError, type AiErrorCode } from './errors'
import type { AiFeature } from './features'
import type { ProviderId } from './provider-ids'

/**
 * Server-action twin of `withTenantAi`: server actions return `{success:false,
 * error}` strings instead of HTTP responses, so this turns a typed AI / provider
 * failure into the localized, role-appropriate copy from `aiErrorNotice.*`.
 *
 * It reuses `handleAiError`, so a key the provider rejected is still flipped to
 * `invalid` with an audit row, and only the error name / status / redacted
 * message is logged. Returns `null` for anything that is not an AI failure
 * (a bug or a validation error of ours): the caller keeps its own message.
 */
export async function aiActionError(
  e: unknown,
  o: {
    tenantId: string
    feature: AiFeature
    role: 'student' | 'teacher' | 'admin'
    actorId?: string | null
    providerId?: ProviderId
  },
): Promise<{ code: AiErrorCode; message: string } | null> {
  let code: AiErrorCode
  try {
    const res = await handleAiError(e, {
      feature: o.feature,
      canConfigure: o.role === 'admin',
      tenantId: o.tenantId,
      providerId: o.providerId,
      actorId: o.actorId,
    })
    const body = (await res.json()) as { error?: { code?: string } }
    const found = body.error?.code
    code = (AI_ERROR_CODES as readonly string[]).includes(found ?? '') ? (found as AiErrorCode) : 'ai_provider_error'
  } catch {
    // handleAiError rethrows what is not an AI failure.
    return null
  }

  try {
    const t = await getTranslations(`aiErrorNotice.${o.role === 'admin' ? 'admin' : 'teacher'}`)
    return { code, message: t(code) }
  } catch {
    return { code, message: FALLBACK[code] }
  }
}

const FALLBACK: Record<AiErrorCode, string> = {
  ai_not_configured: 'AI is not set up for this school yet. Ask your school admin.',
  ai_key_invalid: 'The school AI key was rejected by the provider. Ask your school admin to update it.',
  ai_model_unsupported: "The school's selected AI model cannot handle this request.",
  ai_quota: "The school's AI provider account is out of credit or rate limited.",
  ai_provider_error: "The AI service didn't respond. Please try again in a moment.",
}
