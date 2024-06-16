import { createClient } from '@/utils/supabase/server'

export default async function NotificationsPage () {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error != null) {
        throw new Error(userData.error.message)
    }

    const notifications = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userData.data.user.id)
        .order('created_at', { ascending: false })

    return (
        <div>
            <h1>Notifications</h1>
            <ul>
                {notifications.data.map((notification) => (
                    <li key={notification.notification_id}>
                        {notification.message}
                    </li>
                ))}
            </ul>
        </div>
    )
}
