import { isAiSetupErrorKind, parseAiChatError } from '@/lib/ai/chat-error'
import type { AiErrorCode } from '@/lib/ai/error-codes'

/**
 * What a refused step of a recorded (audio / video) exercise submission means
 * for the student. The two routes answer with a mix of plain English text,
 * `{ error: 'daily_limit_reached' }` and the typed AI body; the recorder used
 * to print whichever it got, raw JSON included (#958). This turns a response
 * into a reason the UI has its own words for, and never carries the body on.
 *
 * Client-safe: no server import.
 */
export type MediaSubmitStep = 'upload-url' | 'analyze'

/** The school's AI setup is why: what `<AiErrorNotice>` needs. */
export interface MediaAiError {
  code: AiErrorCode
  canConfigure: boolean
  settingsUrl: string | null
}

export type MediaSubmitFailure =
  | { kind: 'ai'; error: MediaAiError }
  | { kind: 'daily_limit' }
  | { kind: 'no_access' }
  | { kind: 'generic' }

export function classifyMediaSubmitFailure(
  step: MediaSubmitStep,
  status: number,
  bodyText: string,
): MediaSubmitFailure {
  // The typed AI body first, whatever the status: `ai_quota` is a 429 too.
  const info = parseAiChatError(bodyText)
  if (isAiSetupErrorKind(info.kind)) {
    return { kind: 'ai', error: { code: info.kind, canConfigure: info.canConfigure, settingsUrl: info.settingsUrl } }
  }

  if (step === 'upload-url' && status === 429 && isDailyLimitBody(bodyText)) return { kind: 'daily_limit' }
  // Both routes answer 403 only for a missing (or revoked) course entitlement.
  if (status === 403) return { kind: 'no_access' }
  return { kind: 'generic' }
}

function isDailyLimitBody(bodyText: string): boolean {
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown } | null
    return parsed?.error === 'daily_limit_reached'
  } catch {
    return false
  }
}
