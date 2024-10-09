import { getI18n } from '@/app/locales/server'
import StudentExercisePage from '@/components/dashboards/exercises/StudentExercisePage'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
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
        .select(`*,
            courses(title),
            exercise_completions(*),
            exercise_messages(id,message,role,created_at)`)
        .eq('id', params.exerciseId)
        .eq('exercise_completions.user_id', userData?.data.user.id)
        .order('created_at', { referencedTable: 'exercise_messages', ascending: true })
        .single()

    console.log(exercise)

    const profile = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', userData.data.user.id)
    .single()

    const t = await getI18n()

    const isExerciseCompleted = exercise.data?.exercise_completions.length > 0

    return (
        <div className="container mx-auto">
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
            <StudentExercisePage
                exercise={exercise.data}
                exerciseId={params.exerciseId}
                courseId={params.courseId}
                isExerciseCompleted={isExerciseCompleted}
                profile={profile.data}
            />
        </div>
    )
}
