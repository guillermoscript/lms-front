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

    if (userCourses.error != null) {
        throw new Error(userCourses.error.message)
    }

    if (userSubscriptions.error != null) {
        throw new Error(userSubscriptions.error.message)
    }

    return (
        <>
            {children}
        </>
    )
}
