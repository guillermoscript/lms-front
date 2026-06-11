import type { DbClient, DbResult } from '../client'

export interface ExamListItem {
  exam_id: number
  title: string
  sequence: number | null
  course_id: number
}

export interface ExamSubmissionRow {
  submission_id: number
  exam_id: number
  score: number | null
  submission_date: string
}

export interface ExamAnswerInsert {
  submission_id: number
  question_id: number
  answer_text: string
}

/** Exams across many courses (enrolled-courses progress grid). */
export function getExamsByCourseIds(
  supabase: DbClient,
  courseIds: number[],
  tenantId: string
): DbResult<ExamListItem[]> {
  return supabase
    .from('exams')
    .select('exam_id, title, sequence, course_id')
    .in('course_id', courseIds)
    .eq('tenant_id', tenantId)
}

/**
 * This student's exam submissions. `exam_submissions` keys on `student_id`
 * (NOT `user_id`) and the date column is `submission_date` (NOT
 * `submitted_at`). It DOES carry `tenant_id`.
 */
export function getExamSubmissions(
  supabase: DbClient,
  studentId: string,
  tenantId: string
): DbResult<ExamSubmissionRow[]> {
  return supabase
    .from('exam_submissions')
    .select('submission_id, exam_id, score, submission_date')
    .eq('student_id', studentId)
    .eq('tenant_id', tenantId)
}

/**
 * Create an exam submission and return its id. `exam_submissions` HAS
 * `tenant_id`; pass it. Scores/answers are written separately by the grading
 * step — this only opens the submission row.
 */
export function createExamSubmission(
  supabase: DbClient,
  examId: number,
  studentId: string,
  tenantId: string
): DbResult<{ submission_id: number }> {
  return supabase
    .from('exam_submissions')
    .insert({ exam_id: examId, student_id: studentId, tenant_id: tenantId })
    .select('submission_id')
    .single()
}

/**
 * Bulk-insert a submission's answers. `exam_answers` has NO `tenant_id`
 * (isolation rides on the parent submission via RLS) — never add a tenant
 * filter/column here. Store `answer_text` only; `is_correct` / scores are
 * owned by the grading step.
 */
export function insertExamAnswers(
  supabase: DbClient,
  rows: ExamAnswerInsert[]
): DbResult<unknown> {
  return supabase.from('exam_answers').insert(rows)
}
