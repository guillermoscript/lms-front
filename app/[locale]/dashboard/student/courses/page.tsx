
import { getScopedI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import CourseSectionComponent from '@/components/dashboards/student/course/CourseSectionComponent'
import { createClient } from '@/utils/supabase/server'

export default async function CoursesStudentPage () {
    const supabase = createClient()
    const user = await supabase.auth.getUser()
    const t = await getScopedI18n('BreadcrumbComponent')

    const userCourses = await supabase
        .from('enrollments')
        .select('*, course:course_id(*,lessons(*), exams(*))')
        .eq('user_id', user.data.user.id)

    const userSubscriptions = await supabase
        .from('subscriptions')
        .select('*')
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
            <CourseSectionComponent
                userCourses={userCourses.data}
                userSubscriptions={userSubscriptions.data}
                userId={user.data.user.id}
                supabase={supabase}
                layoutType="flex"
            />
        </>
    )
}
