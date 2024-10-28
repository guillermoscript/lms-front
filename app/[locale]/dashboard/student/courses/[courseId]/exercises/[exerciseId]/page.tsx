import { getI18n } from '@/app/locales/server'
import ExerciseCard from '@/components/dashboards/exercises/ExerciseCard'
import StudentExercisePage from '@/components/dashboards/exercises/StudentExercisePage'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import ToggleableSection from '@/components/dashboards/student/course/lessons/ToggleableSection'
import { createClient } from '@/utils/supabase/server'

export default async function ExerciseStudentPage({
    params,
}: {
    params: { exerciseId: string; courseId: string }
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    const exercise = await supabase
        .from('exercises')
        .select(
            `*,
            courses(title),
            exercise_completions(*),
            exercise_messages(id,message,role,created_at)`
        )
        .eq('id', params.exerciseId)
        .eq('exercise_completions.user_id', userData?.data.user.id)
        .eq('exercise_messages.user_id', userData?.data.user.id)
        .order('created_at', {
            referencedTable: 'exercise_messages',
            ascending: true,
        })
        .single()

    const profile = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', userData.data.user.id)
        .single()

    // search for other 3 exercises
    const exercises = await supabase
        .from('exercise_view')
        .select('*,exercise_completions(id),exercise_messages(id)')
        .eq('course_id', params.courseId)
        .neq('id', params.exerciseId)
        .eq('exercise_completions.user_id', userData?.data.user.id)
        .eq('exercise_messages.user_id', userData?.data.user.id)
        .limit(3)

    const t = await getI18n()

    const isExerciseCompleted = exercise.data?.exercise_completions.length > 0

    return (
        <div className="md:container mx-auto space-y-4">
            <div className="container">
                <BreadcrumbComponent
                    links={[
                        {
                            href: '/dashboard',
                            label: t('BreadcrumbComponent.dashboard'),
                        },
                        {
                            href: '/dashboard/student',
                            label: t('BreadcrumbComponent.student'),
                        },
                        {
                            href: '/dashboard/student/courses/',
                            label: t('BreadcrumbComponent.course'),
                        },
                        {
                            href: `/dashboard/student/courses/${params.courseId}`,
                            label: exercise.data?.courses.title,
                        },
                        {
                            href: `/dashboard/student/courses/${params.courseId}/exercises`,
                            label: t('BreadcrumbComponent.exercise'),
                        },
                        {
                            href: `/dashboard/student/courses/${params.courseId}/exercises/${params.exerciseId}`,
                            label: exercise.data?.title,
                        },
                    ]}
                />
            </div>
            <StudentExercisePage
                exercise={exercise.data}
                exerciseId={params.exerciseId}
                courseId={params.courseId}
                isExerciseCompleted={isExerciseCompleted}
                profile={profile.data}
                studentId={userData.data.user.id}
                isExerciseCompletedSection={
                    <>

                        <h3 className="text-lg font-bold">
                            {t('StudentExercisePage.exerciseSuggestionsDescription')}
                        </h3>
                        {exercises.data.map((exercise) => {
                            return (
                                <ExerciseCard
                                    key={exercise.id}
                                    exercise={exercise as any}
                                    courseId={exercise.course_id as any}
                                    t={t}
                                />
                            )
                        })}
                    </>
                }
            >
                <ToggleableSection
                    isOpen={false}
                    title={t('StudentExercisePage.exerciseSuggestions')}
                >
                    <>
                        {exercises.data.map((exercise) => {
                            return (
                                <ExerciseCard
                                    key={exercise.id}
                                    exercise={exercise as any}
                                    courseId={exercise.course_id as any}
                                    t={t}
                                />
                            )
                        })}
                    </>
                </ToggleableSection>
            </StudentExercisePage>
        </div>
    )
}
