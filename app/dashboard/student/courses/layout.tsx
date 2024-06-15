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

    if (userCourses.error != null || userSubscriptions.error != null) {
        throw new Error(userCourses.error.message || userSubscriptions.error.message)
    }

    return (
        <>
            {children}
        </>
    )
}
