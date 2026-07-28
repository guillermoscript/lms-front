import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { requireCourseAccess, requireRowInCourse } from '@/lib/services/course-access-guard'
import { getTranslations } from 'next-intl/server'
import { EXTERNAL_EXERCISE_TYPES } from '@/lib/checkpoints/types'
import { getCheckpointLinkedExerciseIds } from '@/lib/checkpoints/load'
import { toLatestEvaluation, type LatestExerciseEvaluation } from '@/lib/exercises/latest-evaluation'
import ExerciseResultSummary from '@/components/exercises/exercise-result-summary'
import type { SpeechEvaluation } from '@/lib/speech/types'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import ExerciseCard from '@/components/exercises/exercise-card'
import EssayExercise from '@/components/exercises/essay-exercise'
import CodeExercise from '@/components/exercises/code-exercise'
import ExerciseChat from '@/components/exercises/exercise-chat'
import ToggleableSection from '@/components/exercises/toggleable-section'

const AudioExercise = dynamic(
  () => import('@/components/exercises/audio-exercise'),
  {
    loading: () => (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-12 w-32 mx-auto" />
      </div>
    ),
  }
)

const CodeChallengeWrapper = dynamic(
  () => import('@/components/exercises/code-challenge-wrapper'),
  {
    loading: () => (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    ),
  }
)

const ArtifactExercise = dynamic(
  () => import('@/components/exercises/artifact-exercise'),
  {
    loading: () => (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    ),
  }
)

const VideoExercise = dynamic(
  () => import('@/components/exercises/video-exercise'),
  {
    loading: () => (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-12 w-32 mx-auto" />
      </div>
    ),
  }
)

interface PageProps {
    params: Promise<{ courseId: string; exerciseId: string }>
}

export default async function ExercisePage({ params }: PageProps) {
    const { courseId, exerciseId } = await params
    const supabase = createAdminClient()
    const tenantId = await getCurrentTenantId()

    const userId = await getCurrentUserId()
    if (!userId) redirect('/auth/login')

    // Entitlement gate (#509). Runs before the content query so an unentitled
    // student never causes the exercise config or files to be read at all.
    const numericCourseId = parseInt(courseId)
    await requireCourseAccess(supabase, userId, numericCourseId)

    const { data: exercise, error: exerciseError } = await supabase
        .from('exercises')
        .select(`
      *,
      courses(title),
      exercise_completions(*),
      exercise_messages(id, message, role, created_at)
    `)
        .eq('id', parseInt(exerciseId))
        .eq('tenant_id', tenantId)
        .eq('exercise_completions.user_id', userId)
        .eq('exercise_messages.user_id', userId)
        .order('created_at', {
            referencedTable: 'exercise_messages',
            ascending: true,
        })
        .single()

    if (exerciseError || !exercise) {
        console.error('Error fetching exercise:', exerciseError)
        notFound()
    }

    // The exercise is looked up by id alone, so the gate above is only as good
    // as the URL's courseId actually owning it (#509).
    requireRowInCourse(exercise.course_id, numericCourseId)

    // Non-external checkpoint exercises are answered inside the lesson flow —
    // block direct access and send the student to the lesson instead. External
    // types (code/media/artifact/conversation) keep this page as their flow.
    if (!(EXTERNAL_EXERCISE_TYPES as readonly string[]).includes(exercise.exercise_type)) {
        const { data: checkpoint } = await supabase
            .from('lesson_checkpoints')
            .select('lesson_id')
            .eq('exercise_id', exercise.id)
            .eq('tenant_id', tenantId)
            .eq('is_enabled', true)
            .limit(1)
            .maybeSingle()
        if (checkpoint) {
            redirect(`/dashboard/student/courses/${courseId}/lessons/${checkpoint.lesson_id}`)
        }
    }

    const [{ data: profile }, { data: relatedExercises }, { data: exerciseFiles }, { data: lastSubmission }] = await Promise.all([
        supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', userId)
            .single(),
        supabase
            .from('exercises')
            .select(`
                *,
                exercise_completions(id)
            `)
            .eq('course_id', parseInt(courseId))
            .eq('status', 'published')
            .eq('tenant_id', tenantId)
            .eq('exercise_completions.user_id', userId)
            .neq('id', parseInt(exerciseId))
            .limit(6),
        supabase
            .from('exercise_files')
            .select('file_path, content')
            .eq('exercise_id', parseInt(exerciseId))
            .eq('tenant_id', tenantId),
        supabase
            .from('exercise_code_student_submissions')
            .select('submission_code')
            .eq('exercise_id', parseInt(exerciseId))
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .single(),
    ])

    // "More exercises" suggestions — hide checkpoint-linked ones here too
    const relatedCheckpointIds = await getCheckpointLinkedExerciseIds(supabase, {
        tenantId,
        exerciseIds: (relatedExercises ?? []).map((e) => e.id),
    })
    const otherExercises = (relatedExercises ?? [])
        .filter((e) => !relatedCheckpointIds.has(e.id))
        .slice(0, 3)

    // Fetch evaluation history from unified exercise_evaluations table
    let submissionHistory: { id: number; ai_evaluation: SpeechEvaluation | null; score: number | null; status: string; media_url: string; created_at: string; duration_seconds: number | null }[] = []
    // Newest graded attempt, replayed to the student when they come back to a
    // finished exercise. Derived from the same rows as submissionHistory — the
    // artifact/essay engines write here too, their results were just never read.
    let latestEvaluation: LatestExerciseEvaluation | null = null
    try {
        const { data: evaluations, error: evaluationsError } = await supabase
            .from('exercise_evaluations')
            .select('id, score, passed, ai_result, ai_metrics, engine_type, attempt_number, created_at')
            .eq('exercise_id', parseInt(exerciseId))
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })

        // PostgREST reports failures in `error`, not by throwing, so without this
        // the catch below never fires and a broken query looks like "no attempts".
        if (evaluationsError) console.error('Error fetching exercise evaluations:', evaluationsError)

        // Map to legacy format for AudioExercise component compatibility
        submissionHistory = (evaluations ?? []).map(ev => ({
            id: Number(ev.id),
            ai_evaluation: ev.ai_result as unknown as SpeechEvaluation | null,
            score: ev.score,
            status: ev.passed ? 'completed' : 'failed',
            media_url: '',
            created_at: ev.created_at,
            duration_seconds:
                (ev.ai_metrics as unknown as { duration_seconds?: number | null } | null)
                    ?.duration_seconds ?? null,
        }))

        latestEvaluation = toLatestEvaluation(evaluations?.[0] ?? null)
    } catch (err) {
        // RLS or table access may fail — gracefully degrade
        console.error('Error fetching exercise evaluations:', err)
    }

    const exerciseConfig = exercise.exercise_config as unknown as {
        passing_score?: number
        max_daily_attempts?: number
        artifact_type?: string
        artifact_html?: string
    } | null
    const passingScore = exerciseConfig?.passing_score ?? 70

    // Count today's submissions for daily attempt tracking
    let dailyAttemptsUsed = 0
    const maxDailyAttempts = exerciseConfig?.max_daily_attempts ?? 5
    if (exercise.exercise_type === 'audio_evaluation') {
        try {
            const todayStart = new Date()
            todayStart.setUTCHours(0, 0, 0, 0)
            const { count } = await supabase
                .from('exercise_media_submissions')
                .select('id', { count: 'exact', head: true })
                .eq('exercise_id', parseInt(exerciseId))
                .eq('user_id', userId)
                .eq('tenant_id', tenantId)
                .gte('created_at', todayStart.toISOString())
            dailyAttemptsUsed = count ?? 0
        } catch {
            // Gracefully degrade if query fails
        }
    }

    const files: Record<string, string> = {}
    exerciseFiles?.forEach((file) => {
        files[file.file_path] = file.content
    })

    const isExerciseCompleted = exercise.exercise_completions?.length > 0

    const initialMessages = [
        ...(exercise.exercise_messages || []).map((m: { id: number; message: string; role: string }) => ({
            id: m.id.toString(),
            role: m.role,
            content: m.message,
        }))
    ]

    const courseTitle = Array.isArray(exercise.courses)
        ? exercise.courses[0]?.title
        : (exercise.courses as unknown as { title?: string } | null)?.title || 'Course'

    const tExList = await getTranslations('exercises.list')
    const breadcrumbLinks = [
        { href: '/dashboard/student', label: tExList('breadcrumb.dashboard') },
        { href: `/dashboard/student/courses/${courseId}`, label: courseTitle },
        { href: `/dashboard/student/courses/${courseId}/exercises`, label: tExList('breadcrumb.exercises') },
        { href: '#', label: exercise.title },
    ]

    const t = await getTranslations('exercises.audio')
    const otherExercisesSection = otherExercises && otherExercises.length > 0 ? (
        <>
            {/* Full-strength muted, not /70: the faded variant measured 2.76:1. */}
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">{t('moreExercises')}</h3>
            <div className="grid gap-3">
                {otherExercises.map((ex) => (
                    <ExerciseCard
                        key={ex.id}
                        exercise={ex}
                        courseId={courseId}
                    />
                ))}
            </div>
        </>
    ) : null

    // Code challenges are graded by their own test runner and never write an
    // exercise_evaluations row, so their reviewable record is the completion.
    const codeCompletion = exercise.exercise_completions?.[0] as
        | { score?: number | null; completed_at?: string | null }
        | undefined

    const resultSummary = latestEvaluation ? (
        <ExerciseResultSummary
            score={latestEvaluation.score}
            passed={latestEvaluation.passed}
            feedback={latestEvaluation.feedback}
            strengths={latestEvaluation.strengths}
            improvements={latestEvaluation.improvements}
            attemptNumber={latestEvaluation.attemptNumber}
            completedAt={latestEvaluation.createdAt}
            passingScore={passingScore}
        />
    ) : null

    const codeResultSummary = codeCompletion ? (
        <ExerciseResultSummary
            score={codeCompletion.score ?? null}
            passed
            completedAt={codeCompletion.completed_at ?? null}
        />
    ) : null

    const chatComponent = (
        <ExerciseChat
            apiEndpoint="/api/chat/exercises/student"
            exerciseId={exerciseId}
            initialMessages={initialMessages}
            isExerciseCompleted={isExerciseCompleted}
            profile={profile}
        />
    )

    return (
        <div className="mx-auto container py-3 sm:py-6 px-3 sm:px-4 lg:px-8 space-y-3 sm:space-y-6">
            <BreadcrumbComponent links={breadcrumbLinks} />

            {exercise.exercise_type === 'coding_challenge' ? (
                <CodeExercise
                    exercise={exercise}
                    isExerciseCompleted={isExerciseCompleted}
                    studentId={userId}
                    courseId={courseId}
                    resultSummary={codeResultSummary}
                >
                    <CodeChallengeWrapper
                        exercise={exercise}
                        files={files}
                        exerciseId={exercise.id}
                        isExerciseCompleted={isExerciseCompleted}
                        userCode={lastSubmission?.submission_code}
                    />

                    {otherExercises && otherExercises.length > 0 && (
                        <ToggleableSection
                            title={<h3 className="font-semibold">{t('moreExercises')}</h3>}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                                {otherExercises.map((ex) => (
                                    <ExerciseCard
                                        key={ex.id}
                                        exercise={ex}
                                        courseId={courseId}
                                    />
                                ))}
                            </div>
                        </ToggleableSection>
                    )}
                </CodeExercise>
            ) : exercise.exercise_type === 'artifact' ? (
                <ArtifactExercise
                    exercise={{
                        ...exercise,
                        exercise_config: {
                            artifact_type: exerciseConfig?.artifact_type,
                            artifact_html: exerciseConfig?.artifact_html,
                            passing_score: passingScore,
                        },
                    }}
                    isExerciseCompleted={isExerciseCompleted}
                    passingScore={passingScore}
                    isExerciseCompletedSection={otherExercisesSection}
                    initialEvaluation={
                        latestEvaluation
                            ? {
                                  score: latestEvaluation.score ?? 0,
                                  feedback: latestEvaluation.feedback ?? '',
                                  passed: latestEvaluation.passed,
                                  strengths: latestEvaluation.strengths,
                                  improvements: latestEvaluation.improvements,
                                  passingScore,
                              }
                            : null
                    }
                />
            ) : exercise.exercise_type === 'audio_evaluation' ? (
                <AudioExercise
                    exercise={exercise}
                    isExerciseCompleted={isExerciseCompleted}
                    submissionHistory={submissionHistory}
                    passingScore={passingScore}
                    isExerciseCompletedSection={otherExercisesSection}
                    dailyAttemptsUsed={dailyAttemptsUsed}
                    maxDailyAttempts={maxDailyAttempts}
                />
            ) : exercise.exercise_type === 'video_evaluation' ? (
                <VideoExercise
                    exercise={exercise}
                    isExerciseCompleted={isExerciseCompleted}
                    submissionHistory={submissionHistory}
                    passingScore={passingScore}
                    isExerciseCompletedSection={otherExercisesSection}
                    dailyAttemptsUsed={dailyAttemptsUsed}
                    maxDailyAttempts={maxDailyAttempts}
                />
            ) : (
                <EssayExercise
                    exercise={exercise}
                    exerciseId={exerciseId}
                    courseId={courseId}
                    isExerciseCompleted={isExerciseCompleted}
                    profile={profile}
                    studentId={userId}
                    isExerciseCompletedSection={otherExercisesSection}
                    resultSummary={resultSummary}
                    resultPassed={latestEvaluation?.passed}
                >
                    {chatComponent}
                </EssayExercise>
            )}
        </div>
    )
}
