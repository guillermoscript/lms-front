
import EnrollCard from '@/components/dashboards/student/course/EnrollCard'
import { createClient } from '@/utils/supabase/server'

export const metadata = {
    title: 'Courses Page Layout',
    description: 'Courses page layout for student'
}

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

    const userSubscriptions = await supabase
        .from('subscriptions')
        .select('subscription_id')
        .eq('user_id', user.data.user.id)
        .eq('subscription_status', 'active')

    if (isUserEnrolled.error != null) {
        if (isUserEnrolled.error.code === 'PGRST116') {
            if (userSubscriptions.error != null || userSubscriptions.data.length === 0) {
                throw new Error(userSubscriptions?.error?.message || 'You are not authorized to view this page.')
            }

            const courseTitle = await supabase
                .from('courses')
                .select('title, description, thumbnail_url')
                .eq('course_id', Number(params.courseId))
                .single()

            return (
                <>
                    <EnrollCard
                        courseName={courseTitle.data.title}
                        courseId={Number(params.courseId)}
                        courseDescription={courseTitle.data.description}
                        courseThumbnail={courseTitle.data.thumbnail_url}
                    />
                </>
            )
        }
        throw new Error(isUserEnrolled.error.message)
    }

    if (isUserEnrolled.data.length === 0) {
        if (userSubscriptions.error != null || userSubscriptions.data.length === 0) {
            throw new Error(userSubscriptions?.error?.message || 'You are not authorized to view this page.')
        }

        const courseTitle = await supabase
            .from('courses')
            .select('title, description, thumbnail_url')
            .eq('course_id', Number(params.courseId))
            .single()

        return (
            <>
                <EnrollCard
                    courseName={courseTitle.data.title}
                    courseId={Number(params.courseId)}
                    courseDescription={courseTitle.data.description}
                    courseThumbnail={courseTitle.data.thumbnail_url}
                />
            </>
        )
    }

    return (
        <>
            {children}
        </>
    )
}
