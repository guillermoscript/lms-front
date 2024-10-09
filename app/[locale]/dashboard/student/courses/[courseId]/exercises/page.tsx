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

    const exerciseData = await supabase
        .from('exercises')
        .select(
            `
            *,
            courses(*)
        `
        )
        .eq('course_id', params.courseId)

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
                        href: `/dashboard/student/courses/${exerciseData.data[0].course_id}/exercises`,
                        label: exerciseData.data[0].courses.title,
                    },
                    {
                        href: `/dashboard/student/courses/${exerciseData.data[0].course_id}/exercises`,
                        label: t('BreadcrumbComponent.exercise'),
                    },
                ]}
            />

            <CourseExercisesPage
                courseId={params.courseId}
                exercises={exerciseData.data}
                courseTitle={exerciseData.data[0].title}
            />
        </div>
    )
}
