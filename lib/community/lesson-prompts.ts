import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBlockedAuthorIds } from '@/lib/community/blocks'
import { visiblePostsQuery } from '@/lib/community/feed'

/** The lesson shows at most this many prompts; the rest are in the course feed. */
export const LESSON_PROMPT_LIMIT = 10

const PROMPT_COLUMNS = 'id, title, content, is_pinned, is_locked, is_graded, created_at, author_id'

type PromptRow = {
  id: string
  title: string | null
  content: string
  is_pinned: boolean
  is_locked: boolean
  is_graded: boolean
  created_at: string
  author_id: string
}

export type LessonPrompt = PromptRow & {
  /**
   * Answers as the prompt's thread shows them: visible, top-level, by nobody
   * the viewer blocked. Not the feed's `comment_count`, which counts replies
   * and never drops when a comment is removed (it only sets `is_hidden`).
   */
  answer_count: number
}

export type LessonPrompts =
  | { enabled: false }
  | {
      enabled: true
      prompts: LessonPrompt[]
      answeredIds: Set<string>
      hasMore: boolean
      /** New on every read: tells a fresh render from a cached one (see `lesson-answers.ts`). */
      loadId: string
    }

/**
 * A lesson's discussion prompts, as the course feed would show them (#869).
 *
 * Reads with the service role, like `getFeedPage`, so the CALLER owns the
 * access decision: the lesson page has already run `requireCourseAccess` and
 * `requireRowInCourse`. A user-scoped read would be wrong here, not just
 * slower: the course-posts SELECT policy still checks `enrollments`, so a
 * student entitled through a subscription (and never enrolled) would see an
 * empty discussion the feed shows them in full. The tenant, course and lesson
 * are explicit filters, and `visiblePostsQuery` applies the feed's own
 * hidden/blocked rules.
 *
 * Pinned first, then oldest first — a lesson's questions read in the order the
 * teacher asked them. `answeredIds` holds the prompts the viewer answered at
 * the top level: a reply to someone else's answer is not an answer.
 *
 * Throws on a query error; `{ enabled: false }` when the plan has no community.
 */
export async function getLessonPrompts({
  tenantId,
  viewerId,
  courseId,
  lessonId,
}: {
  tenantId: string
  viewerId: string
  courseId: number
  lessonId: number
}): Promise<LessonPrompts> {
  const admin = createAdminClient()
  const loadId = crypto.randomUUID()

  const [{ data: enabled, error: planError }, blockedIds] = await Promise.all([
    admin.rpc('community_enabled', { _tenant_id: tenantId }),
    getBlockedAuthorIds(viewerId),
  ])
  if (planError) throw planError
  if (!enabled) return { enabled: false }

  const { data, error } = await visiblePostsQuery(admin, {
    columns: PROMPT_COLUMNS,
    tenantId,
    scope: 'course',
    courseId,
    blockedIds,
  })
    .eq('lesson_id', lessonId)
    .eq('post_type', 'discussion_prompt')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(LESSON_PROMPT_LIMIT + 1)

  if (error) throw error

  const rows = ((data ?? []) as PromptRow[]).slice(0, LESSON_PROMPT_LIMIT)
  const hasMore = (data ?? []).length > LESSON_PROMPT_LIMIT
  if (rows.length === 0) return { enabled: true, prompts: [], answeredIds: new Set(), hasMore, loadId }

  // One count per prompt (at most ten, in parallel): a single row fetch would
  // be cut off at PostgREST's max_rows on a large cohort.
  const [{ data: answers, error: answersError }, ...counts] = await Promise.all([
    admin
      .from('community_comments')
      .select('post_id')
      .eq('tenant_id', tenantId)
      .eq('author_id', viewerId)
      .eq('is_hidden', false)
      .is('parent_comment_id', null)
      .in(
        'post_id',
        rows.map((p) => p.id)
      ),
    ...rows.map((p) => answerCountQuery(admin, { tenantId, postId: p.id, blockedIds })),
  ])

  if (answersError) throw answersError
  const countError = counts.find((c) => c.error)?.error
  if (countError) throw countError

  return {
    enabled: true,
    prompts: rows.map((p, i) => ({ ...p, answer_count: counts[i].count ?? 0 })),
    answeredIds: new Set((answers ?? []).map((a) => a.post_id as string)),
    hasMore,
    loadId,
  }
}

/** A prompt's answers, counted by the rules its thread (`getComments`) shows them by. */
function answerCountQuery(
  admin: ReturnType<typeof createAdminClient>,
  { tenantId, postId, blockedIds }: { tenantId: string; postId: string; blockedIds: string[] }
) {
  let query = admin
    .from('community_comments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('post_id', postId)
    .eq('is_hidden', false)
    .is('parent_comment_id', null)
  if (blockedIds.length > 0) {
    query = query.not('author_id', 'in', `(${blockedIds.join(',')})`)
  }
  return query
}

/**
 * How many visible discussion prompts each lesson of a course has, for the
 * teacher's lesson list (#869). `null` when the plan has no community — the
 * list then shows no counts and no shortcut.
 *
 * Takes the page's user-scoped client: only course staff reach that page, and
 * the staff branch of the course-posts SELECT policy (exempt from the blocks
 * policy) returns every prompt of the course.
 *
 * Never throws. It is started before the page's own `Promise.all`, so a
 * failure is logged and the list renders without counts.
 */
export async function getLessonPromptCounts(
  supabase: SupabaseClient,
  { tenantId, courseId }: { tenantId: string; courseId: number }
): Promise<Map<number, number> | null> {
  try {
    const [{ data: enabled, error: planError }, { data, error }] = await Promise.all([
      supabase.rpc('community_enabled', { _tenant_id: tenantId }),
      supabase
        .from('community_posts')
        .select('lesson_id')
        .eq('tenant_id', tenantId)
        .eq('course_id', courseId)
        .eq('post_type', 'discussion_prompt')
        .eq('is_hidden', false)
        .not('lesson_id', 'is', null),
    ])
    if (planError) throw planError
    if (error) throw error
    if (!enabled) return null

    const counts = new Map<number, number>()
    for (const row of (data ?? []) as { lesson_id: number | null }[]) {
      if (row.lesson_id === null) continue
      counts.set(row.lesson_id, (counts.get(row.lesson_id) ?? 0) + 1)
    }
    return counts
  } catch (error) {
    console.error('Failed to count discussion prompts:', error)
    return null
  }
}
