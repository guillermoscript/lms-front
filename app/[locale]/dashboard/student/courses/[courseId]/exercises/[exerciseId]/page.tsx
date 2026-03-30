import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getTranslations } from 'next-intl/server'

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

interface PageProps {
    params: Promise<{ courseId: string; exerciseId: string }>
}

export default async function ExercisePage({ params }: PageProps) {
    const { courseId, exerciseId } = await params
    const supabase = createAdminClient()
    const tenantId = await getCurrentTenantId()

    const userId = await getCurrentUserId()
    if (!userId) redirect('/auth/login')

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

    const [{ data: profile }, { data: otherExercises }, { data: exerciseFiles }, { data: lastSubmission }] = await Promise.all([
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
            .limit(3),
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

    // Fetch evaluation history from unified exercise_evaluations table
    let submissionHistory: { id: number; ai_evaluation: any; score: any; status: string; media_url: string; created_at: string; duration_seconds: number | null }[] = []
    try {
        const { data: evaluations } = await supabase
            .from('exercise_evaluations')
            .select('id, score, passed, ai_result, ai_metrics, engine_type, attempt_number, created_at')
            .eq('exercise_id', parseInt(exerciseId))
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })

        // Map to legacy format for AudioExercise component compatibility
        submissionHistory = (evaluations ?? []).map(ev => ({
            id: Number(ev.id),
            ai_evaluation: ev.ai_result,
            score: ev.score,
            status: ev.passed ? 'completed' : 'failed',
            media_url: '',
            created_at: ev.created_at,
            duration_seconds: (ev.ai_metrics as any)?.duration_seconds ?? null,
        }))
    } catch {
        // RLS or table access may fail — gracefully degrade
    }

    const passingScore = (exercise.exercise_config as any)?.passing_score ?? 70

    // Count today's submissions for daily attempt tracking
    let dailyAttemptsUsed = 0
    const maxDailyAttempts = (exercise.exercise_config as any)?.max_daily_attempts ?? 5
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
        ...(exercise.exercise_messages || []).map((m: any) => ({
            id: m.id.toString(),
            role: m.role,
            content: m.message,
        }))
    ]

    const courseTitle = Array.isArray(exercise.courses)
        ? exercise.courses[0]?.title
        : (exercise.courses as any)?.title || 'Course'

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
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 mb-3">{t('moreExercises')}</h3>
            <div className="grid gap-3">
                {otherExercises.map((ex: any) => (
                    <ExerciseCard
                        key={ex.id}
                        exercise={ex}
                        courseId={courseId}
                    />
                ))}
            </div>
        </>
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
        <div className="mx-auto max-w-7xl py-3 sm:py-6 px-3 sm:px-4 lg:px-8 space-y-3 sm:space-y-6">
            <BreadcrumbComponent links={breadcrumbLinks} />

            {exercise.exercise_type === 'coding_challenge' ? (
                <CodeExercise
                    exercise={exercise}
                    isExerciseCompleted={isExerciseCompleted}
                    studentId={userId}
                    courseId={courseId}
                >
                    <CodeChallengeWrapper
                        exercise={exercise}
                        files={files}
                        exerciseId={exercise.id}
                        isExerciseCompleted={isExerciseCompleted}
                        userCode={lastSubmission?.submission_code}
                        tenantId={tenantId}
                    />

                    {otherExercises && otherExercises.length > 0 && (
                        <ToggleableSection
                            title={<h3 className="font-semibold">{t('moreExercises')}</h3>}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                                {otherExercises.map((ex: any) => (
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
                            artifact_type: (exercise.exercise_config as any)?.artifact_type,
                            artifact_html: (exercise.exercise_config as any)?.artifact_html,
                            passing_score: passingScore,
                        },
                    }}
                    isExerciseCompleted={isExerciseCompleted}
                    passingScore={passingScore}
                    isExerciseCompletedSection={otherExercisesSection}
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
            ) : (
                <EssayExercise
                    exercise={exercise}
                    exerciseId={exerciseId}
                    courseId={courseId}
                    isExerciseCompleted={isExerciseCompleted}
                    profile={profile}
                    studentId={userId}
                    isExerciseCompletedSection={otherExercisesSection}
                >
                    {chatComponent}
                </EssayExercise>
            )}
        </div>
    )
}
