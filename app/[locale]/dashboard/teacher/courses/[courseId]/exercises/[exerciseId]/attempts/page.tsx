import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/dashboard/page-shell'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { isGradedEvalExerciseType } from '@/lib/ai/evals/schema'
import { parseExerciseAiResult } from '@/lib/exercises/latest-evaluation'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadExerciseChallengePlays } from '@/lib/challenges/staff'
import { StaffAttemptList } from '@/components/challenges/staff-attempt-list'
import { ExerciseAttemptList, type ExerciseAttempt } from '@/components/teacher/exercise-attempts/attempt-list'

interface PageProps {
  params: Promise<{ courseId: string; exerciseId: string }>
}

const ATTEMPT_LIMIT = 100

/** Every AI-graded attempt at one exercise, newest first, for the teacher to review and regrade. */
export default async function ExerciseAttemptsPage({ params }: PageProps) {
  const { courseId, exerciseId } = await params
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.exerciseAttempts')
  const tenantId = await getCurrentTenantId()
  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const { data: exercise } = await supabase
    .from('exercises')
    .select('id, title, exercise_type, exercise_config')
    .eq('id', parseInt(exerciseId))
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
    .single()
  if (!exercise) return notFound()

  const [{ data: course }, role] = await Promise.all([
    supabase.from('courses').select('author_id').eq('course_id', parseInt(courseId)).eq('tenant_id', tenantId).single(),
    getUserRole(),
  ])
  if (!course || (course.author_id !== userId && role !== 'admin')) return notFound()

  const back = { href: `/dashboard/teacher/courses/${courseId}/exercises/${exerciseId}`, label: exercise.title }
  if (!isGradedEvalExerciseType(exercise.exercise_type)) {
    return (
      <PageShell variant="reading">
        <PageHeader back={back} title={t('title')} />
        <p className="text-sm text-muted-foreground">{t('unsupported')}</p>
      </PageShell>
    )
  }

  const { data: rows, error } = await supabase
    .from('exercise_evaluations')
    .select('id, user_id, score, passed, ai_result, attempt_number, created_at, submission_text, teacher_score, teacher_passed, teacher_feedback, reviewed_at')
    .eq('exercise_id', exercise.id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(ATTEMPT_LIMIT)
  if (error) throw new Error('Could not load attempts')

  const studentIds = [...new Set((rows ?? []).map((r) => r.user_id))]
  const { data: profiles } = studentIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', studentIds)
    : { data: [] }
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  const config = (exercise.exercise_config ?? {}) as { passing_score?: unknown }
  const passingScore = typeof config.passing_score === 'number' ? Math.min(100, Math.max(0, config.passing_score)) : 70

  const attempts: ExerciseAttempt[] = (rows ?? []).map((r) => ({
    id: r.id,
    studentName: names.get(r.user_id) || t('unknownStudent'),
    attemptNumber: r.attempt_number,
    createdAt: r.created_at,
    aiScore: r.score,
    aiPassed: r.passed,
    aiFeedback: parseExerciseAiResult(r.ai_result).feedback,
    answer: r.submission_text,
    teacherScore: r.teacher_score,
    teacherPassed: r.teacher_passed,
    teacherFeedback: r.teacher_feedback,
    reviewedAt: r.reviewed_at,
  }))

  // Ownership (course author or admin) was verified above; challenge tables are
  // server-write/read only, hence the admin client with an explicit tenant filter.
  const [locale, tc, challenge] = await Promise.all([
    getLocale(),
    getTranslations('challenges.staff'),
    loadExerciseChallengePlays(tenantId, exercise.id, createAdminClient()),
  ])

  return (
    <PageShell variant="reading">
      <PageHeader back={back} title={t('title')} description={t('description', { passingScore })} />
      <ExerciseAttemptList exerciseId={exercise.id} passingScore={passingScore} attempts={attempts} limited={attempts.length === ATTEMPT_LIMIT} />
      <section aria-labelledby="challenge-attempts" className="space-y-3 border-t pt-6" data-testid="challenge-attempts-section">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="challenge-attempts" className="text-base font-semibold">{tc('attemptsTitle')}</h2>
          <Link className="text-sm underline underline-offset-2" href={`/dashboard/teacher/challenges/${exercise.id}`}>{tc('viewAll')}</Link>
        </div>
        <p className="text-sm text-muted-foreground">{tc('attemptsDescription')}</p>
        <StaffAttemptList attempts={challenge.attempts} locale={locale} limited={challenge.attempts.length === 500} />
      </section>
    </PageShell>
  )
}
