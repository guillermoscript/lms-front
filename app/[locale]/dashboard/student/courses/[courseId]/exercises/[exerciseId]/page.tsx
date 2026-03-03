import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getTranslations } from 'next-intl/server'

import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import ExerciseCard from '@/components/exercises/exercise-card'
import EssayExercise from '@/components/exercises/essay-exercise'
import CodeExercise from '@/components/exercises/code-exercise'
import CodeChallengeWrapper from '@/components/exercises/code-challenge-wrapper'
import ExerciseChat from '@/components/exercises/exercise-chat'
import ToggleableSection from '@/components/exercises/toggleable-section'
import AudioExercise from '@/components/exercises/audio-exercise'

interface PageProps {
    params: Promise<{ courseId: string; exerciseId: string }>
}

export default async function ExercisePage({ params }: PageProps) {
    const { courseId, exerciseId } = await params
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

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
        .eq('exercise_completions.user_id', user.id)
        .eq('exercise_messages.user_id', user.id)
        .order('created_at', {
            referencedTable: 'exercise_messages',
            ascending: true,
        })
        .single()

    if (exerciseError || !exercise) {
        console.error('Error fetching exercise:', exerciseError)
        notFound()
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single()

    const { data: otherExercises } = await supabase
        .from('exercises')
        .select(`
            *,
            exercise_completions(id)
        `)
        .eq('course_id', parseInt(courseId))
        .eq('status', 'published')
        .eq('tenant_id', tenantId)
        .eq('exercise_completions.user_id', user.id)
        .neq('id', parseInt(exerciseId))
        .limit(3)

    const { data: exerciseFiles } = await supabase
        .from('exercise_files')
        .select('file_path, content')
        .eq('exercise_id', parseInt(exerciseId))
        .eq('tenant_id', tenantId)

    const { data: lastSubmission } = await supabase
        .from('exercise_code_student_submissions')
        .select('submission_code')
        .eq('exercise_id', parseInt(exerciseId))
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .single()

    // Fetch all completed/failed media submissions for history
    let submissionHistory: { id: number; ai_evaluation: any; score: any; status: string; media_url: string; created_at: string; duration_seconds: number | null }[] = []
    try {
        const { data: mediaSubmissions } = await supabase
            .from('exercise_media_submissions')
            .select('id, ai_evaluation, score, status, media_url, created_at, duration_seconds')
            .eq('exercise_id', parseInt(exerciseId))
            .eq('user_id', user.id)
            .eq('tenant_id', tenantId)
            .in('status', ['completed', 'failed'])
            .order('created_at', { ascending: false })
        submissionHistory = mediaSubmissions ?? []
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
                .eq('user_id', user.id)
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

    const breadcrumbLinks = [
        { href: '/dashboard/student', label: 'Dashboard' },
        { href: `/dashboard/student/courses/${courseId}`, label: courseTitle },
        { href: `/dashboard/student/courses/${courseId}/exercises`, label: 'Exercises' },
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
        <div className="mx-auto max-w-7xl py-6 px-4 lg:px-8 space-y-6">
            <BreadcrumbComponent links={breadcrumbLinks} />

            {exercise.exercise_type === 'coding_challenge' ? (
                <CodeExercise
                    exercise={exercise}
                    isExerciseCompleted={isExerciseCompleted}
                    studentId={user.id}
                    courseId={courseId}
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
                            title={<h3 className="font-semibold">Recommended Exercises</h3>}
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
                    studentId={user.id}
                    isExerciseCompletedSection={otherExercisesSection}
                >
                    {chatComponent}
                </EssayExercise>
            )}
        </div>
    )
}
