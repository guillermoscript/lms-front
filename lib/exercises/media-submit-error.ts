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
  | { kind: 'too_many_pending' }
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

  // upload-url has two caps of its own behind 429: the daily one (JSON) and the
  // flood guard on submissions still in flight (plain text).
  if (step === 'upload-url' && status === 429) {
    return { kind: isDailyLimitBody(bodyText) ? 'daily_limit' : 'too_many_pending' }
  }
  // Both routes answer 403 only for a missing (or revoked) course entitlement.
  if (status === 403) return { kind: 'no_access' }
  return { kind: 'generic' }
}

/**
 * What a refused analyze leaves of the recording. Its row already counted
 * against the daily cap and the file is in storage, so sending the same take
 * through upload-url again would spend a second attempt on nothing (#958):
 * - `retry`: a typed AI error (key, quota, provider down). The route put the
 *   row back to `pending`, or never claimed it, so the same submission can be
 *   analyzed again. A provider rejection that is not transient is typed too but
 *   leaves the row `failed`; the retry learns that as a 400.
 * - `busy`: 409, a run on it is still in flight. Keep it, ask again later.
 * - `gone`: anything else. The row is terminal (400), missing (404) or the
 *   student lost access: only a new recording goes on from here.
 */
export type MediaAnalyzeRetry = 'retry' | 'busy' | 'gone'

export function mediaAnalyzeRetry(status: number, failure: MediaSubmitFailure): MediaAnalyzeRetry {
  if (failure.kind === 'ai') return 'retry'
  return status === 409 ? 'busy' : 'gone'
}

function isDailyLimitBody(bodyText: string): boolean {
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown } | null
    return parsed?.error === 'daily_limit_reached'
  } catch {
    return false
  }
}
