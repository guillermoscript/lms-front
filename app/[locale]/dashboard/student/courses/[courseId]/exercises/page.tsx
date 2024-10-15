import { getI18n } from '@/app/locales/server'
import CourseExercisesPage from '@/components/dashboards/exercises/CourseExercisesPage'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import { createClient } from '@/utils/supabase/server'

export default async function ExercisesPage({
    params,
}: {
    params: { courseId: string }
}) {
    const supabase = createClient()
    const t = await getI18n()
    const userData = await supabase.auth.getUser()

    const exerciseData = await supabase
        .from('exercises')
        .select(
            `
            id, 
            title,
            description,
            exercise_type,
            difficulty_level,
            time_limit,
            courses(*),
            exercise_completions(id),
            exercise_messages(id)
        `
        )
        .eq('course_id', params.courseId)

        .eq('exercise_completions.user_id', userData.data.user.id)
        .eq('exercise_messages.user_id', userData.data.user.id)

    console.log(exerciseData.data)

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
                        label: exerciseData.data[0].courses.title,
                    },
                    {
                        href: `/dashboard/student/courses/${params.courseId}/exercises`,
                        label: t('BreadcrumbComponent.exercise'),
                    },
                ]}
            />

            <CourseExercisesPage
                courseId={params.courseId}
                exercises={exerciseData.data as any}
                courseTitle={exerciseData.data[0].courses.title}
            />
        </div>
    )
}
