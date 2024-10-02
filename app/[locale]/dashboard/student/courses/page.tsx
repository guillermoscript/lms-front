import { getScopedI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import CourseDashboard from '@/components/dashboards/student/course/CourseDashboard'
import { createClient } from '@/utils/supabase/server'

export default async function CourseSectionComponent () {
    const supabase = createClient()
    const user = await supabase.auth.getUser()
    const t = await getScopedI18n('BreadcrumbComponent')

    const userCourses = await supabase
        .from('enrollments')
        .select(`
            course:course_id(
                course_id,
                title,
                description,
                thumbnail_url,
                lessons(id),
                exams(exam_id)
            )
        `)
        .eq('user_id', user.data.user.id)

    const userSubscriptions = await supabase
        .from('subscriptions')
        .select('subscription_id')
        .eq('user_id', user.data.user.id)

    if (userCourses.error) throw new Error(userCourses.error.message)
    if (userSubscriptions.error) throw new Error(userSubscriptions.error.message)

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('dashboard') },
                    { href: '/dashboard/student', label: t('student') },
                    { href: '/dashboard/student/courses/', label: t('courses') },
                ]}
            />
            <CourseDashboard
                userCourses={userCourses.data}
            />
        </>
    )
}
