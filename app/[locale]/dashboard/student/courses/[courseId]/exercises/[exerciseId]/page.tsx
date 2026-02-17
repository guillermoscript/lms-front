import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

// Components
import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import ExerciseCard from '@/components/exercises/exercise-card'
import EssayExercise from '@/components/exercises/essay-exercise'
import CodeExercise from '@/components/exercises/code-exercise'
import CodeChallengeWrapper from '@/components/exercises/code-challenge-wrapper'
import ExerciseChat from '@/components/exercises/exercise-chat'
import ToggleableSection from '@/components/exercises/toggleable-section'
import { Card, CardContent } from '@/components/ui/card'

interface PageProps {
    params: Promise<{ courseId: string; exerciseId: string }>
}

export default async function ExercisePage({ params }: PageProps) {
    const { courseId, exerciseId } = await params
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    // Fetch exercise data with completions and messages
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

    // Fetch student profile (profiles table has no tenant_id - global table)
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single()

    // Find other exercises for suggestions
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

    // Fetch exercise files (for coding challenges)
    const { data: exerciseFiles } = await supabase
        .from('exercise_files')
        .select('file_path, content')
        .eq('exercise_id', parseInt(exerciseId))
        .eq('tenant_id', tenantId)

    // Fetch last submission
    const { data: lastSubmission } = await supabase
        .from('exercise_code_student_submissions')
        .select('submission_code')
        .eq('exercise_id', parseInt(exerciseId))
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .single()

    // Construct files object for Sandpack
    const files: Record<string, string> = {}
    exerciseFiles?.forEach((file) => {
        files[file.file_path] = file.content
    })

    const isExerciseCompleted = exercise.exercise_completions?.length > 0

    // Format initial messages
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

    const otherExercisesSection = otherExercises && otherExercises.length > 0 ? (
        <>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">More Exercises</h3>
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
        <div className="mx-auto max-w-7xl py-4 px-3 sm:py-6 sm:px-4 lg:px-8 space-y-4 sm:space-y-6">
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
