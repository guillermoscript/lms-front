import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import ExerciseForm from '@/components/dashboards/teacher/exercises/ExerciseForm'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function CreateExercisePage({
    params
}: {
    params: { courseId: string }
}) {
    const supabase = createClient()
    const course = await supabase
        .from('courses')
        .select('*')
        .eq('course_id', params.courseId)
        .single()

    if (course.error != null) {
        console.log(course.error.message)
        throw new Error(course.error.message)
    }

    const t = await getI18n()
    console.log(course)
    return (
        <div className=' container mx-auto'>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/teacher', label: t('BreadcrumbComponent.teacher') },
                    { href: '/dashboard/teacher/courses', label: t('BreadcrumbComponent.course') },
                    { href: `/dashboard/teacher/courses/${params.courseId}`, label: course?.data?.title },
                    { href: `/dashboard/teacher/courses/${params.courseId}/exercises`, label: t('BreadcrumbComponent.exercise') }
                ]}
            />

            <ExerciseForm
                params={params}
            />
        </div>
    )
}
