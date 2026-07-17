import type { DbClient, DbResult } from '../client'

export interface LessonListItem {
  id: number
  title: string
  sequence: number | null
  course_id: number
}

export interface LessonCompletionRow {
  lesson_id: number
  completed_at: string | null
  user_id: string
}

/**
 * This user's lesson completions. `lesson_completions` has NO `tenant_id`
 * column and keys on `user_id` (NOT `student_id`) — scope by user only.
 * Used both for the progress-% rollup and the "already completed" set.
 */
export function getLessonCompletions(
  supabase: DbClient,
  userId: string
): DbResult<LessonCompletionRow[]> {
  return supabase
    .from('lesson_completions')
    .select('lesson_id, completed_at, user_id')
    .eq('user_id', userId)
}

/** Published lessons of one course, ordered for sequential display. */
export function getPublishedLessonsByCourse(
  supabase: DbClient,
  courseId: number,
  tenantId: string
): DbResult<LessonListItem[]> {
  return supabase
    .from('lessons')
    .select('id, title, sequence, course_id')
    .eq('course_id', courseId)
    .eq('status', 'published')
    .eq('tenant_id', tenantId)
    .order('sequence', { ascending: true })
}

/** Lessons across many courses (e.g. the enrolled-courses progress grid). */
export function getLessonsByCourseIds(
  supabase: DbClient,
  courseIds: number[],
  tenantId: string
): DbResult<LessonListItem[]> {
  return supabase
    .from('lessons')
    .select('id, title, sequence, course_id')
    .in('course_id', courseIds)
    .eq('tenant_id', tenantId)
}

/**
 * Mark a lesson complete for this user. `lesson_completions` has NO
 * `tenant_id` — insert `user_id` + `lesson_id` only; `completed_at` defaults
 * server-side. Caller decides idempotency (upsert / pre-check).
 */
export function markLessonComplete(
  supabase: DbClient,
  lessonId: number,
  userId: string
): DbResult<unknown> {
  return supabase
    .from('lesson_completions')
    .insert({ lesson_id: lessonId, user_id: userId })
}
