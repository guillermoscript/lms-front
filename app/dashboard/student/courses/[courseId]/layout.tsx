
import EnrollCard from '@/components/dashboards/student/course/EnrollCard'
import { createClient } from '@/utils/supabase/server'

export default async function CoursesPageLayout ({
    children,
    params
}: {
    children: React.ReactNode
    params: {
        courseId: string
    }
}) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    if (user.error != null) {
        throw new Error(user.error.message)
    }
    const isUserEnrolled = await supabase
        .from('enrollments')
        .select('enrollment_id')
        .eq('user_id', user.data.user.id)
        .eq('course_id', Number(params.courseId))

    if (isUserEnrolled.error != null) {
        if (isUserEnrolled.error.code === 'PGRST116') {
            return (
                <EnrollCard courseId={Number(params.courseId)} />
            )
        }
        throw new Error(isUserEnrolled.error.message)
    }

    if (isUserEnrolled.data.length === 0) {
        return (
            <EnrollCard courseId={Number(params.courseId)} />
        )
    }

    return (
        <>
            {children}
        </>
    )
}
