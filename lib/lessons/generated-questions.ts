/**
 * Shared shapes for AI-generated lesson questions (#398).
 *
 * The generation route returns `GeneratedQuestion[]` drafts; the teacher
 * edits/approves them in the review dialog; approved items are persisted by
 * `saveApprovedQuestions` as DRAFT exercises linked to the lesson (plus an
 * optional video checkpoint). Nothing here is student-visible.
 */

export type GeneratedQuestionKind =
  | 'short_answer'
  | 'fill_in_the_blank'
  | 'multiple_choice'

export interface GeneratedQuestion {
  kind: GeneratedQuestionKind
  /** Short exercise title, e.g. "Importing a single function". */
  title: string
  /** The question text the student will see. */
  prompt: string
  /** What a passing answer must show — becomes evaluation_criteria / explanation. */
  rubric: string
  /** short_answer only — key terms a good answer mentions ([] otherwise). */
  expected_keywords: string[]
  /** fill_in_the_blank only — normalized accepted answers ([] otherwise). */
  accepted_answers: string[]
  /** multiple_choice only — 3-5 options ([] otherwise). */
  options: string[]
  /** multiple_choice only — index into options; -1 otherwise. */
  correct_index: number
  /** Shown to the student after answering. */
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
  /** Suggested video placement in seconds; -1 when no video/unknown. */
  video_timestamp_seconds: number
}

export interface GenerateQuestionsResponse {
  questions: GeneratedQuestion[]
  transcript_used: boolean
  transcript_language: string | null
}

/** Payload the review dialog sends for each approved item. */
export interface ApprovedQuestion extends GeneratedQuestion {
  /** Whether to also create a video checkpoint at video_timestamp_seconds. */
  create_video_checkpoint: boolean
}
