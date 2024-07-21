import StudentChatSidebar from '@/components/dashboards/student/chat/StudentChatSidebar'
import NoCoruseOrSubAlert from '@/components/dashboards/student/NoCoruseOrSubAlert'
import { createClient } from '@/utils/supabase/server'

export default async function CoursesLayout ({
    children
}: {
    children: React.ReactNode
}) {
    const supabase = createClient()
    const user = await supabase.auth.getUser()

    if (user.error != null) {
        throw new Error(user.error.message)
    }

    const userCourses = await supabase
        .from('enrollments')
        .select('enrollment_id')
        .eq('user_id', user.data.user.id)

    const userSubscriptions = await supabase
        .from('subscriptions')
        .select('subscription_id')
        .eq('user_id', user.data.user.id)
        .eq('subscription_status', 'active')

    if (userSubscriptions.error != null && userCourses.error != null) {
        throw new Error(
            'Something went wrong while fetching your courses and subscriptions.'
        )
    }

    if (userSubscriptions.data.length === 0 && userCourses.data.length === 0) {
        return (
            <NoCoruseOrSubAlert />
        )
    }

    return (
        <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr] gap-6">
            <StudentChatSidebar
                userRole='student'
            />
            <div className="flex flex-col">
                {children}
            </div>
        </div>
    )
}
