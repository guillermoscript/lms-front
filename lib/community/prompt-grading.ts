import { createAdminClient } from '@/lib/supabase/admin'
import type { GradingRow, ViewerPromptGrade } from '@/lib/community/prompt-grades'

type AdminClient = ReturnType<typeof createAdminClient>

const PAGE = 1000
const IN_CHUNK = 200

export interface GradingPrompt {
  id: string
  title: string | null
  content: string
  is_graded: boolean
  is_locked: boolean
  due_at: string | null
  created_at: string
  lesson: { id: number; title: string } | null
}

/** Every row of a query, a page at a time: PostgREST caps one response. */
async function allRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

function chunks<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * A graded prompt and every student the teacher grades on it (#873).
 *
 * Service role, so the CALLER owns the access decision (the page checks the
 * viewer is the course's author or an admin of this school). Tenant and course
 * are explicit filters.
 *
 * The roster is the school's ACTIVE students who are actively enrolled in the
 * course, plus any active student who answered or was already graded (a
 * subscriber who never enrolled, a student whose enrollment ended). Answers
 * are visible top-level comments — a reply to a classmate is not an answer.
 *
 * Returns null when the post is not a graded discussion prompt of this course.
 */
export async function getPromptGradingRoster({
  tenantId,
  courseId,
  postId,
}: {
  tenantId: string
  courseId: number
  postId: string
}): Promise<{ prompt: GradingPrompt; rows: GradingRow[] } | null> {
  const admin = createAdminClient()

  const { data: post, error: postError } = await admin
    .from('community_posts')
    .select('id, title, content, is_graded, is_locked, due_at, created_at, lesson_id, post_type, is_hidden')
    .eq('id', postId)
    .eq('tenant_id', tenantId)
    .eq('course_id', courseId)
    .maybeSingle()
  if (postError) throw postError
  if (!post || post.is_hidden || post.post_type !== 'discussion_prompt' || !post.is_graded) return null

  const [lesson, enrolled, answers, grades] = await Promise.all([
    post.lesson_id
      ? admin
          .from('lessons')
          .select('id, title')
          .eq('id', post.lesson_id)
          .eq('course_id', courseId)
          .maybeSingle()
          .then(({ data }) => data)
      : Promise.resolve(null),
    allRows<{ user_id: string }>((from, to) =>
      admin
        .from('enrollments')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('course_id', courseId)
        .eq('status', 'active')
        .order('user_id')
        .range(from, to)
    ),
    allRows<{ id: string; author_id: string; content: string; created_at: string }>((from, to) =>
      admin
        .from('community_comments')
        .select('id, author_id, content, created_at')
        .eq('tenant_id', tenantId)
        .eq('post_id', postId)
        .is('parent_comment_id', null)
        .eq('is_hidden', false)
        .order('created_at', { ascending: true })
        .order('id')
        .range(from, to)
    ),
    allRows<{ student_id: string; score: number; feedback: string | null; graded_at: string }>((from, to) =>
      admin
        .from('community_prompt_grades')
        .select('student_id, score, feedback, graded_at')
        .eq('tenant_id', tenantId)
        .eq('post_id', postId)
        .order('student_id')
        .range(from, to)
    ),
  ])

  const candidateIds = [
    ...new Set([
      ...enrolled.map((e) => e.user_id),
      ...answers.map((a) => a.author_id),
      ...grades.map((g) => g.student_id),
    ]),
  ]

  // Only the school's active students are graded (the database refuses the rest).
  const studentIds = new Set<string>()
  const profiles = new Map<string, { full_name: string | null; avatar_url: string | null }>()
  for (const ids of chunks(candidateIds)) {
    const [{ data: members, error: membersError }, { data: people, error: peopleError }] = await Promise.all([
      admin
        .from('tenant_users')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('role', 'student')
        .eq('status', 'active')
        .in('user_id', ids),
      admin.from('profiles').select('id, full_name, avatar_url').in('id', ids),
    ])
    if (membersError) throw membersError
    if (peopleError) throw peopleError
    for (const m of members ?? []) studentIds.add(m.user_id)
    for (const p of people ?? []) profiles.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
  }

  const answersBy = new Map<string, GradingRow['answers']>()
  for (const a of answers) {
    answersBy.set(a.author_id, [
      ...(answersBy.get(a.author_id) ?? []),
      { id: a.id, content: a.content, created_at: a.created_at },
    ])
  }
  const gradeBy = new Map(grades.map((g) => [g.student_id, g]))

  const rows: GradingRow[] = [...studentIds].map((id) => {
    const g = gradeBy.get(id)
    return {
      studentId: id,
      name: profiles.get(id)?.full_name ?? null,
      avatarUrl: profiles.get(id)?.avatar_url ?? null,
      answers: answersBy.get(id) ?? [],
      grade: g ? { score: g.score, feedback: g.feedback, graded_at: g.graded_at } : null,
    }
  })

  return {
    prompt: {
      id: post.id,
      title: post.title,
      content: post.content,
      is_graded: post.is_graded,
      is_locked: post.is_locked,
      due_at: post.due_at,
      created_at: post.created_at,
      lesson: lesson ? { id: lesson.id, title: lesson.title } : null,
    },
    rows,
  }
}

/**
 * The viewer's OWN grades on these prompts (#873), keyed by post id. Service
 * role, filtered to `viewerId` — never anybody else's grade. Posts that are not
 * graded prompts simply have none.
 */
export async function getViewerPromptGrades(
  admin: AdminClient,
  { tenantId, viewerId, postIds }: { tenantId: string; viewerId: string; postIds: string[] }
): Promise<Map<string, ViewerPromptGrade>> {
  const grades = new Map<string, ViewerPromptGrade>()
  if (postIds.length === 0) return grades
  const { data, error } = await admin
    .from('community_prompt_grades')
    .select('post_id, score, feedback, graded_at')
    .eq('tenant_id', tenantId)
    .eq('student_id', viewerId)
    .in('post_id', postIds)
  if (error) throw error
  for (const g of data ?? []) {
    grades.set(g.post_id, { score: g.score, feedback: g.feedback, graded_at: g.graded_at })
  }
  return grades
}

export interface PromptToGrade {
  postId: string
  courseId: number
  label: string | null
  /** Students who answered and have no grade yet. */
  waiting: number
}

/** A prompt's name in a list: its title, else an excerpt of its text. */
function promptLabel(title: string | null, content: string): string | null {
  if (title?.trim()) return title.trim()
  const flat = content.replace(/\s+/g, ' ').trim()
  if (!flat) return null
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat
}

/**
 * The teacher's grading queue for community prompts (#873): graded prompts in
 * these courses with answers still waiting for a grade, most waiting first.
 * "Waiting" = an active student of the school with a visible top-level answer
 * and no grade on that prompt. Service role; the caller passes only courses
 * the viewer teaches.
 */
export async function getPromptsToGrade({
  tenantId,
  courseIds,
}: {
  tenantId: string
  courseIds: number[]
}): Promise<{ prompts: PromptToGrade[]; total: number }> {
  if (courseIds.length === 0) return { prompts: [], total: 0 }
  const admin = createAdminClient()

  const { data: prompts, error } = await admin
    .from('community_posts')
    .select('id, course_id, title, content')
    .eq('tenant_id', tenantId)
    .eq('post_type', 'discussion_prompt')
    .eq('is_graded', true)
    .eq('is_hidden', false)
    .in('course_id', courseIds)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  if (!prompts || prompts.length === 0) return { prompts: [], total: 0 }

  const ids = prompts.map((p) => p.id)
  const [answers, grades] = await Promise.all([
    allRows<{ post_id: string; author_id: string }>((from, to) =>
      admin
        .from('community_comments')
        .select('post_id, author_id')
        .eq('tenant_id', tenantId)
        .in('post_id', ids)
        .is('parent_comment_id', null)
        .eq('is_hidden', false)
        .order('id')
        .range(from, to)
    ),
    allRows<{ post_id: string; student_id: string }>((from, to) =>
      admin
        .from('community_prompt_grades')
        .select('post_id, student_id')
        .eq('tenant_id', tenantId)
        .in('post_id', ids)
        .order('id')
        .range(from, to)
    ),
  ])

  const authorIds = [...new Set(answers.map((a) => a.author_id))]
  const students = new Set<string>()
  for (const chunk of chunks(authorIds)) {
    const { data, error: membersError } = await admin
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('role', 'student')
      .eq('status', 'active')
      .in('user_id', chunk)
    if (membersError) throw membersError
    for (const m of data ?? []) students.add(m.user_id)
  }

  const graded = new Set(grades.map((g) => `${g.post_id}:${g.student_id}`))
  const waitingBy = new Map<string, Set<string>>()
  for (const a of answers) {
    if (!students.has(a.author_id) || graded.has(`${a.post_id}:${a.author_id}`)) continue
    const set = waitingBy.get(a.post_id) ?? new Set<string>()
    set.add(a.author_id)
    waitingBy.set(a.post_id, set)
  }

  const queue: PromptToGrade[] = prompts
    .filter((p) => (waitingBy.get(p.id)?.size ?? 0) > 0 && p.course_id !== null)
    .map((p) => ({
      postId: p.id,
      courseId: p.course_id as number,
      label: promptLabel(p.title, p.content),
      waiting: waitingBy.get(p.id)!.size,
    }))
    .sort((a, b) => b.waiting - a.waiting)

  return { prompts: queue, total: queue.reduce((sum, p) => sum + p.waiting, 0) }
}
