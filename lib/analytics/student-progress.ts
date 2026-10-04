/**
 * Per-student progress for one course — the teacher's view of "how is each
 * student doing, what do they still have left, and did they stop?" (#647).
 *
 * WHAT THIS ANSWERS
 *   The Students tab of the teacher course page listed enrolments with a name
 *   and a date and nothing else. A teacher adjusting a course needs, per
 *   student: how far they got, what remains, when they were last seen, and
 *   whether they are still moving. Across the cohort they need where the group
 *   stops — the lesson after which completions fall off.
 *
 * THE NUMBER MUST MATCH WHAT THE STUDENT SEES
 *   `overallPercentage` is lessons-only, exactly the formula the student's own
 *   course page uses (`app/[locale]/dashboard/student/courses/[courseId]/page.tsx`:
 *   completed published lessons / published lessons). Exams and exercises are
 *   reported as their own counts. A teacher and a student comparing screens
 *   must see the same figure, so this deliberately does NOT use the
 *   lessons+exams average in `lib/services/course-progress-service.ts`.
 *
 * ENGAGEMENT STATUS
 *   `completed`   every published lesson done and every published exam passed
 *   `not_started` no activity of any kind in this course
 *   `active`      some activity, the latest within `STALL_DAYS`
 *   `stalled`     some activity, but nothing for `STALL_DAYS` or longer
 *
 *   "Activity" is the union of the timestamps this schema keeps for a student
 *   inside a course: lesson views (the student lesson page upserts one row
 *   per user+lesson, #650), lesson completions, exercise completions, exam
 *   submissions, checkpoint attempts and practice attempts. Views make
 *   re-reading count as activity; rows predating the view tracker simply
 *   contribute nothing.
 *
 * RLS
 *   Every read runs as the signed-in teacher through the teacher-scoped SELECT
 *   policies each table already carries ("Teachers and admins view all
 *   completions", "Teachers and admins can view tenant exam submissions",
 *   "Teachers and admins can view all exercise completions",
 *   `lesson_checkpoint_attempts_teachers_read_tenant`,
 *   `teachers_view_tenant_practice_attempts`). Nothing here uses the admin
 *   client. `lesson_completions` and `exercise_completions` carry no
 *   `tenant_id` (see CLAUDE.md), so they are scoped by the course's own
 *   lesson / exercise ids instead.
 *
 * A source that fails to read is downgraded to a named warning rather than
 * blanking the tab: the page shows the warning, so "no activity" from a broken
 * query never masquerades as "the student did nothing".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'

// ── Tunables ─────────────────────────────────────────────────────────────────

/** Days without any activity before an in-progress student counts as stalled. */
export const STALL_DAYS = 14

/**
 * `exams` has no `passing_score` column (CLAUDE.md) — 70 is the platform-wide
 * default threshold every other reader uses.
 */
export const EXAM_PASS_SCORE = 70

// ── Public types ─────────────────────────────────────────────────────────────

export type EngagementStatus = 'not_started' | 'active' | 'stalled' | 'completed'

export const ENGAGEMENT_STATUSES: readonly EngagementStatus[] = [
  'active',
  'stalled',
  'not_started',
  'completed',
]

/** A course item as the aggregation needs it — id, title, order. */
export interface CourseItem {
  id: number
  title: string
  sequence: number | null
}

export interface StudentLessonCompletion {
  lessonId: number
  completedAt: string | null
}

export interface StudentExamResult {
  examId: number
  attempts: number
  /** Highest score across attempts; `null` when nothing has been graded yet. */
  bestScore: number | null
  lastAttemptAt: string | null
  passed: boolean
}

export interface StudentProgress {
  userId: string
  /** Lessons-only, 0–100 — the same figure the student sees. */
  overallPercentage: number
  lessonsCompleted: number
  totalLessons: number
  completedLessons: StudentLessonCompletion[]
  exercisesCompleted: number
  totalExercises: number
  completedExerciseIds: number[]
  examsPassed: number
  totalExams: number
  exams: StudentExamResult[]
  /** Latest timestamp across every activity source, or `null` if none. */
  lastActivityAt: string | null
  status: EngagementStatus
  /** First published lesson (by sequence) the student has not completed. */
  nextLessonId: number | null
}

export interface LessonFunnelStep extends CourseItem {
  /** Students in the cohort who completed this lesson. */
  completedBy: number
}

export interface CourseProgressReport {
  students: StudentProgress[]
  summary: {
    total: number
    byStatus: Record<EngagementStatus, number>
    /** Mean `overallPercentage`; `null` for an empty cohort. */
    avgProgress: number | null
  }
  /** Published lessons in order with how many students completed each. */
  lessonFunnel: LessonFunnelStep[]
  /** Row counts per source so an empty tab can explain itself. */
  sources: {
    lessonCompletions: number
    lessonViews: number
    exerciseCompletions: number
    examSubmissions: number
    checkpointAttempts: number
    practiceAttempts: number
  }
  /** Sources that could not be read — surfaced in the UI, never swallowed. */
  warnings: string[]
  /** The clock the report was built against — client code formats relative times from it, so server and client agree. */
  generatedAt: string
}

export interface CourseProgressInput {
  courseId: number
  tenantId: string
  /** Enrolled students to report on. */
  userIds: string[]
  /** Published lessons only — what the student's own progress counts. */
  lessons: CourseItem[]
  /** Published, standalone exercises (checkpoint-embedded ones excluded). */
  exercises: CourseItem[]
  /** Published exams only. */
  exams: CourseItem[]
  /** Injectable clock so tests can pin "now". */
  now?: Date
}

// ── Row shapes (only the columns each query selects) ─────────────────────────

interface LessonCompletionRow {
  user_id: string
  lesson_id: number
  completed_at: string | null
}

interface ExerciseCompletionRow {
  user_id: string
  exercise_id: number
  completed_at: string | null
}

interface ExamSubmissionRow {
  student_id: string
  exam_id: number
  score: number | null
  submission_date: string | null
}

interface ActivityRow {
  user_id: string
  created_at: string
}

type Client = SupabaseClient<Database>

// ── Helpers ──────────────────────────────────────────────────────────────────

async function attempt<T>(
  signal: string,
  fallback: T,
  run: () => Promise<T>
): Promise<{ value: T; warning: string | null }> {
  try {
    return { value: await run(), warning: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { value: fallback, warning: `${signal}: ${message}` }
  }
}

function bySequence<T extends CourseItem>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.id - b.id
  )
}

/** Later of two ISO timestamps; tolerates nulls and unparsable strings. */
function later(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a
  const tb = Date.parse(b)
  if (Number.isNaN(tb)) return a
  if (!a) return b
  return tb > Date.parse(a) ? b : a
}

/** The pure part: classify one student given what was read for them. */
export function classifyEngagement(args: {
  lessonsCompleted: number
  totalLessons: number
  examsPassed: number
  totalExams: number
  lastActivityAt: string | null
  now: Date
}): EngagementStatus {
  const { lessonsCompleted, totalLessons, examsPassed, totalExams, lastActivityAt, now } = args
  const allLessons = totalLessons > 0 && lessonsCompleted >= totalLessons
  const allExams = examsPassed >= totalExams
  if (allLessons && allExams) return 'completed'
  if (!lastActivityAt) return 'not_started'
  const ageMs = now.getTime() - Date.parse(lastActivityAt)
  return ageMs >= STALL_DAYS * 86_400_000 ? 'stalled' : 'active'
}

// ── Readers ──────────────────────────────────────────────────────────────────

function readLessonCompletions(client: Client, userIds: string[], lessonIds: number[]) {
  if (lessonIds.length === 0) return Promise.resolve([] as LessonCompletionRow[])
  return fetchAllRowsIn<LessonCompletionRow, string>('lesson_completions', userIds, (chunk, from, to) =>
    client
      .from('lesson_completions')
      .select('user_id, lesson_id, completed_at', { count: 'exact' })
      .in('lesson_id', lessonIds)
      .in('user_id', chunk)
      .order('id')
      .range(from, to)
  )
}

interface LessonViewRow {
  user_id: string
  viewed_at: string | null
}

function readLessonViews(client: Client, userIds: string[], lessonIds: number[]) {
  if (lessonIds.length === 0) return Promise.resolve([] as LessonViewRow[])
  return fetchAllRowsIn<LessonViewRow, string>('lesson_views', userIds, (chunk, from, to) =>
    client
      .from('lesson_views')
      .select('user_id, viewed_at', { count: 'exact' })
      .in('lesson_id', lessonIds)
      .in('user_id', chunk)
      .order('id')
      .range(from, to)
  )
}

function readExerciseCompletions(client: Client, userIds: string[], exerciseIds: number[]) {
  if (exerciseIds.length === 0) return Promise.resolve([] as ExerciseCompletionRow[])
  return fetchAllRowsIn<ExerciseCompletionRow, string>('exercise_completions', userIds, (chunk, from, to) =>
    client
      .from('exercise_completions')
      .select('user_id, exercise_id, completed_at', { count: 'exact' })
      .in('exercise_id', exerciseIds)
      .in('user_id', chunk)
      .order('id')
      .range(from, to)
  )
}

function readExamSubmissions(client: Client, tenantId: string, userIds: string[], examIds: number[]) {
  if (examIds.length === 0) return Promise.resolve([] as ExamSubmissionRow[])
  return fetchAllRowsIn<ExamSubmissionRow, string>('exam_submissions', userIds, (chunk, from, to) =>
    client
      .from('exam_submissions')
      .select('student_id, exam_id, score, submission_date', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .in('exam_id', examIds)
      .in('student_id', chunk)
      .order('submission_id')
      .range(from, to)
  )
}

function readCheckpointAttempts(client: Client, tenantId: string, courseId: number, userIds: string[]) {
  return fetchAllRowsIn<ActivityRow, string>('lesson_checkpoint_attempts', userIds, (chunk, from, to) =>
    client
      .from('lesson_checkpoint_attempts')
      .select('user_id, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('course_id', courseId)
      .in('user_id', chunk)
      .order('id')
      .range(from, to)
  )
}

function readPracticeAttempts(client: Client, tenantId: string, courseId: number, userIds: string[]) {
  return fetchAllRowsIn<ActivityRow, string>('practice_attempts', userIds, (chunk, from, to) =>
    client
      .from('practice_attempts')
      .select('user_id, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('course_id', courseId)
      .in('user_id', chunk)
      .order('id')
      .range(from, to)
  )
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function getCourseProgressReport(
  client: Client,
  input: CourseProgressInput
): Promise<CourseProgressReport> {
  const now = input.now ?? new Date()
  const userIds = [...new Set(input.userIds.filter(Boolean))]
  const lessons = bySequence(input.lessons)
  const exercises = bySequence(input.exercises)
  const exams = bySequence(input.exams)
  const lessonIds = lessons.map((l) => l.id)
  const exerciseIds = exercises.map((e) => e.id)
  const examIds = exams.map((e) => e.id)

  const [lc, lv, ec, es, cp, pa] = await Promise.all([
    attempt('lesson_completions', [] as LessonCompletionRow[], () =>
      readLessonCompletions(client, userIds, lessonIds)
    ),
    attempt('lesson_views', [] as LessonViewRow[], () => readLessonViews(client, userIds, lessonIds)),
    attempt('exercise_completions', [] as ExerciseCompletionRow[], () =>
      readExerciseCompletions(client, userIds, exerciseIds)
    ),
    attempt('exam_submissions', [] as ExamSubmissionRow[], () =>
      readExamSubmissions(client, input.tenantId, userIds, examIds)
    ),
    attempt('lesson_checkpoint_attempts', [] as ActivityRow[], () =>
      readCheckpointAttempts(client, input.tenantId, input.courseId, userIds)
    ),
    attempt('practice_attempts', [] as ActivityRow[], () =>
      readPracticeAttempts(client, input.tenantId, input.courseId, userIds)
    ),
  ])
  const warnings = [lc, lv, ec, es, cp, pa].map((r) => r.warning).filter((w): w is string => w !== null)

  // ── Index every source by student ────────────────────────────────────────
  const lessonSet = new Set(lessonIds)
  const exerciseSet = new Set(exerciseIds)

  const lessonsByUser = new Map<string, Map<number, string | null>>()
  for (const row of lc.value) {
    if (!lessonSet.has(row.lesson_id)) continue
    let m = lessonsByUser.get(row.user_id)
    if (!m) lessonsByUser.set(row.user_id, (m = new Map()))
    // A lesson can be completed, un-completed and completed again; keep the latest stamp.
    m.set(row.lesson_id, later(m.get(row.lesson_id) ?? null, row.completed_at))
  }

  const exercisesByUser = new Map<string, Map<number, string | null>>()
  for (const row of ec.value) {
    if (!exerciseSet.has(row.exercise_id)) continue
    let m = exercisesByUser.get(row.user_id)
    if (!m) exercisesByUser.set(row.user_id, (m = new Map()))
    m.set(row.exercise_id, later(m.get(row.exercise_id) ?? null, row.completed_at))
  }

  const examsByUser = new Map<string, Map<number, StudentExamResult>>()
  for (const row of es.value) {
    let m = examsByUser.get(row.student_id)
    if (!m) examsByUser.set(row.student_id, (m = new Map()))
    const cur = m.get(row.exam_id) ?? {
      examId: row.exam_id,
      attempts: 0,
      bestScore: null,
      lastAttemptAt: null,
      passed: false,
    }
    cur.attempts += 1
    // An ungraded submission (score null) counts as an attempt but never as a score.
    if (row.score != null && (cur.bestScore == null || row.score > cur.bestScore)) {
      cur.bestScore = row.score
    }
    cur.lastAttemptAt = later(cur.lastAttemptAt, row.submission_date)
    cur.passed = cur.bestScore != null && cur.bestScore >= EXAM_PASS_SCORE
    m.set(row.exam_id, cur)
  }

  const activityByUser = new Map<string, string | null>()
  const bump = (userId: string, at: string | null | undefined) =>
    activityByUser.set(userId, later(activityByUser.get(userId) ?? null, at))
  for (const row of lv.value) bump(row.user_id, row.viewed_at)
  for (const row of cp.value) bump(row.user_id, row.created_at)
  for (const row of pa.value) bump(row.user_id, row.created_at)

  // ── Per-student rows ─────────────────────────────────────────────────────
  const funnelCounts = new Map<number, number>(lessonIds.map((id) => [id, 0]))
  const byStatus: Record<EngagementStatus, number> = {
    not_started: 0,
    active: 0,
    stalled: 0,
    completed: 0,
  }

  const students: StudentProgress[] = userIds.map((userId) => {
    const done = lessonsByUser.get(userId) ?? new Map<number, string | null>()
    const completedLessons: StudentLessonCompletion[] = lessons
      .filter((l) => done.has(l.id))
      .map((l) => ({ lessonId: l.id, completedAt: done.get(l.id) ?? null }))
    for (const c of completedLessons) {
      funnelCounts.set(c.lessonId, (funnelCounts.get(c.lessonId) ?? 0) + 1)
    }

    const exDone = exercisesByUser.get(userId) ?? new Map<number, string | null>()
    const completedExerciseIds = exercises.filter((e) => exDone.has(e.id)).map((e) => e.id)

    const examMap = examsByUser.get(userId) ?? new Map<number, StudentExamResult>()
    const examResults: StudentExamResult[] = exams.map(
      (e) =>
        examMap.get(e.id) ?? {
          examId: e.id,
          attempts: 0,
          bestScore: null,
          lastAttemptAt: null,
          passed: false,
        }
    )

    let lastActivityAt = activityByUser.get(userId) ?? null
    for (const c of completedLessons) lastActivityAt = later(lastActivityAt, c.completedAt)
    for (const at of exDone.values()) lastActivityAt = later(lastActivityAt, at)
    for (const r of examResults) lastActivityAt = later(lastActivityAt, r.lastAttemptAt)

    const totalLessons = lessons.length
    const lessonsCompleted = completedLessons.length
    const examsPassed = examResults.filter((r) => r.passed).length
    const status = classifyEngagement({
      lessonsCompleted,
      totalLessons,
      examsPassed,
      totalExams: exams.length,
      lastActivityAt,
      now,
    })
    byStatus[status] += 1

    const nextLesson = lessons.find((l) => !done.has(l.id))

    return {
      userId,
      overallPercentage: totalLessons > 0 ? Math.round((lessonsCompleted / totalLessons) * 100) : 0,
      lessonsCompleted,
      totalLessons,
      completedLessons,
      exercisesCompleted: completedExerciseIds.length,
      totalExercises: exercises.length,
      completedExerciseIds,
      examsPassed,
      totalExams: exams.length,
      exams: examResults,
      lastActivityAt,
      status,
      nextLessonId: nextLesson?.id ?? null,
    }
  })

  const avgProgress =
    students.length > 0
      ? Math.round(students.reduce((s, st) => s + st.overallPercentage, 0) / students.length)
      : null

  return {
    students,
    summary: { total: students.length, byStatus, avgProgress },
    lessonFunnel: lessons.map((l) => ({ ...l, completedBy: funnelCounts.get(l.id) ?? 0 })),
    sources: {
      lessonCompletions: lc.value.length,
      lessonViews: lv.value.length,
      exerciseCompletions: ec.value.length,
      examSubmissions: es.value.length,
      checkpointAttempts: cp.value.length,
      practiceAttempts: pa.value.length,
    },
    warnings,
    generatedAt: now.toISOString(),
  }
}
