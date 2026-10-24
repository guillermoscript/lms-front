import type { StructuredRequirements } from '@/lib/ai/lesson-requirements'
import type { AiErrorCode } from '@/lib/ai/error-codes'
import { parseAiChatError, isAiSetupErrorKind } from '@/lib/ai/chat-error'

/** The editor's unsaved task config, as the evals API takes it (`draftConfigSchema`). */
export interface EvalDraft {
  task_instructions?: string
  system_prompt?: string
  requirements?: StructuredRequirements | null
}

export interface EvalsProp {
  lessonId: number
  draft: EvalDraft
}

export interface AiSetupError {
  code: AiErrorCode
  canConfigure: boolean
  settingsUrl: string | null
}

export interface EvalResponse<T = unknown> {
  ok: boolean
  status: number
  data: (T & { error?: unknown }) | null
  /** Set when the failure is the school's AI setup (no key, bad key, quota...). */
  aiError: AiSetupError | null
  /** Machine code for plain failures (`case_limit`, `no_cases`, ...). */
  code: string | null
}

/** fetch + JSON + classification of the typed AI-setup error body. */
export async function evalRequest<T = unknown>(url: string, init?: RequestInit): Promise<EvalResponse<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    })
    const text = res.status === 204 ? '' : await res.text()
    let data: (T & { error?: unknown }) | null = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    let aiError: AiSetupError | null = null
    if (!res.ok && text) {
      const info = parseAiChatError(text)
      if (isAiSetupErrorKind(info.kind)) {
        aiError = { code: info.kind, canConfigure: info.canConfigure, settingsUrl: info.settingsUrl }
      }
    }
    const code = !res.ok && data && typeof data.error === 'string' ? data.error : null
    return { ok: res.ok, status: res.status, data, aiError, code }
  } catch {
    return { ok: false, status: 0, data: null, aiError: null, code: null }
  }
}

export const DRIFT_THRESHOLD = 30

// ---- Graded-answer evals (F2): AI-graded exercises --------------------------
// Types and constants come from the server schema module (zod only, client-safe).

import { DEFAULT_GRADED_TOLERANCE, EVAL_LIMITS, GRADED_CATEGORIES, GRADED_REPEATS, isGradedEvalExerciseType } from '@/lib/ai/evals/schema'
import type { GradedResultRow } from '@/lib/ai/evals/schema'

export { DEFAULT_GRADED_TOLERANCE, GRADED_CATEGORIES, GRADED_REPEATS }
export type {
  GradedCaseRow,
  GradedCategory,
  GradedExpected,
  GradedOutput,
  GradedReason,
  GradedRunSummary,
} from '@/lib/ai/evals/schema'

export function isGradedExerciseType(type: string | null | undefined): boolean {
  return !!type && isGradedEvalExerciseType(type)
}

export const GRADED_CASE_LIMIT = EVAL_LIMITS.maxCasesPerTarget
/** Fired on window when a case is saved outside the tests panel (e.g. from the preview modal). */
export const GRADED_CASES_CHANGED_EVENT = 'ai-evals:graded-cases-changed'

/** Result row of a graded run, as GET /runs/[runId] returns it. */
export type GradedRunResult = GradedResultRow
