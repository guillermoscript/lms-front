import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import LessonForm from '@/components/dashboards/teacher/lessons/LessonForm'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function CreateLessonPage ({
    params
}: {
    params: { courseId: string, lessonId: string }
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
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/teacher', label: t('BreadcrumbComponent.teacher') },
                    { href: '/dashboard/teacher/courses', label: t('BreadcrumbComponent.course') },
                    { href: `/dashboard/teacher/courses/${params.courseId}`, label: course?.data?.title },
                    { href: `/dashboard/teacher/courses/${params.courseId}/lessons`, label: t('BreadcrumbComponent.lesson') }
                ]}
            />

            <LessonForm params={params} />
        </>
    )
}
