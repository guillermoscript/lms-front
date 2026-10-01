/**
 * Questions with an accepted answer (#875). Pure helpers shared by the feed
 * pages, the feed action, the comment thread and the teacher dashboard; the
 * rule itself (who may accept, what may be accepted) lives in the database —
 * supabase/migrations/20260929150000_community_questions_875.sql.
 */

export const QUESTION_FILTERS = ['questions', 'unanswered', 'answered'] as const
export type QuestionFilter = (typeof QUESTION_FILTERS)[number]

/** The search param the feeds read, e.g. `?questions=unanswered`. */
export const QUESTION_FILTER_PARAM = 'questions'

/** A `?questions=` value, or null when it is missing or not one we know. */
export function parseQuestionFilter(raw: string | string[] | null | undefined): QuestionFilter | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  return (QUESTION_FILTERS as readonly string[]).includes(value ?? '') ? (value as QuestionFilter) : null
}

/** Whether a post belongs in the feed under this question filter. */
export function matchesQuestionFilter(
  post: { post_type: string; accepted_comment_id: string | null },
  filter: QuestionFilter | null
): boolean {
  if (!filter) return true
  if (post.post_type !== 'question') return false
  if (filter === 'unanswered') return post.accepted_comment_id === null
  if (filter === 'answered') return post.accepted_comment_id !== null
  return true
}

/**
 * The order of a question's top-level answers: the accepted one first, then
 * the most `helpful` reactions, then the oldest. Anything that is not a
 * question keeps its chronological order.
 */
export function rankAnswers<T extends { id: string; created_at: string; helpful_count: number }>(
  roots: T[],
  { isQuestion, acceptedCommentId }: { isQuestion: boolean; acceptedCommentId: string | null }
): T[] {
  if (!isQuestion) return roots
  return [...roots].sort((a, b) => {
    if (a.id === acceptedCommentId) return -1
    if (b.id === acceptedCommentId) return 1
    if (b.helpful_count !== a.helpful_count) return b.helpful_count - a.helpful_count
    return Date.parse(a.created_at) - Date.parse(b.created_at)
  })
}

/** Who may accept an answer — mirrors community_can_accept_answer() for the UI. */
export function canAcceptAnswers({
  viewerId,
  viewerRole,
  questionAuthorId,
}: {
  viewerId: string
  viewerRole: string | null
  questionAuthorId: string
}): boolean {
  return viewerId === questionAuthorId || viewerRole === 'teacher' || viewerRole === 'admin'
}

/** Maps the trigger's refusals to something a member can act on. */
export function acceptAnswerErrorKey(
  error: { code?: string; message?: string } | null | undefined
): 'acceptNotAllowed' | 'acceptInvalid' | null {
  if (!error) return null
  if (error.code === '42501') return 'acceptNotAllowed'
  if (error.code === '23514') return 'acceptInvalid'
  return null
}
