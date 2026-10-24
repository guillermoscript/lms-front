import type { ExamCaseRow, ExamOutput, ExamQuestionExpected } from '@/lib/ai/evals/schema'

export { evalRequest, GRADED_REPEATS, type AiSetupError } from './types'

/** What the UI knows about a saved exam question. Never carries answer keys or rubrics. */
export interface ExamQuestionInfo {
  id: string
  type: 'multiple_choice' | 'true_false' | 'free_text'
  text: string
  points: number
  options: { id: string; text: string }[]
}

export { DEFAULT_EXAM_TOLERANCE as EXAM_DEFAULT_TOLERANCE } from '@/lib/ai/evals/schema'
export const EXAM_CASES_CHANGED_EVENT = 'ai-evals:exam-cases-changed'

export type {
  ExamCaseRow,
  ExamCategory,
  ExamOutput,
  ExamPreviewQuestion,
  ExamPreviewResult,
  ExamQuestionExpected,
  ExamQuestionOutcome,
  ExamReason,
  ExamRunSummary,
} from '@/lib/ai/evals/schema'

/** Result row of an exam run, as GET /runs/[runId] returns it. */
export interface ExamRunResult {
  id: string
  case_id: string | null
  case_name: string
  expected?: ExamCaseRow['expected'] | null
  scores: number[] | null
  score: number | null
  score_stddev: number | null
  output: ExamOutput | null
  deviation: number | null
  passed: boolean | null
  error: string | null
}

export interface ExamCasePatch {
  name: string
  importance_note: string | null
  input: { answers: Record<string, string> }
  expected: { questions: Record<string, ExamQuestionExpected>; total_tolerance: number }
}
