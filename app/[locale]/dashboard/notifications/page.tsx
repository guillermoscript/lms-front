import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Eye } from 'lucide-react'

import NotificationSidebarFilter from '@/components/dashboards/notifications/NotificationSidebarFilter'
import NotificationsReadButton from '@/components/dashboards/notifications/NotificationsReadButton'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { createClient } from '@/utils/supabase/server'

dayjs.extend(relativeTime)

function formatNotificationTime (created_at: string): string {
    return dayjs(created_at).fromNow()
}

export default async function NotificationsPage ({ searchParams }: {
    searchParams?: {
        filter?: string
    }
}) {
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

    if (notifications.error) {
        console.log(notifications.error)
        throw new Error(notifications.error.message)
    }

    const filteredData = (searchParams.filter === 'all' || !searchParams.filter) ? notifications.data : notifications.data.filter((notification) => notification.notification_type === searchParams.filter)

    return (
        <>
            <div className="flex justify-between items-center px-8 py-4 border-b border-gray-200 dark:border-gray-700">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            Notifications
                </h1>
                <button className="text-lg text-blue-500">Settings</button>
            </div>
            <div className="grid md:grid-cols-3 grid-cols-1 gap-4 mt-4 px-8">
                <aside className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Filter by type
                    </h2>
                    <NotificationSidebarFilter />
                </aside>
                <div className="md:col-span-2">
                    <ul className="space-y-4">
                        {filteredData.map((notification) => (
                            <li
                                key={notification.notification_id}
                                className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow"
                            >
                                <div className="flex items-center mb-2">
                                    <div className="text-sm">
                                        <p className="text-gray-500 dark:text-gray-400">
                                            {formatNotificationTime(notification.created_at)}
                                        </p>
                                    </div>
                                </div>
                                <div className="ml-13">
                                    <ViewMarkdown markdown={notification.message} />
                                    <div className="flex text-gray-600 dark:text-gray-400 mt-3 space-x-4">
                                        {/* <button className="flex items-center space-x-1">
                                            <ThumbsUpIcon className="h-5 w-5" />
                                            <span>Like</span>
                                        </button> */}
                                        <NotificationsReadButton notification={notification}>
                                            {notification.read ? (
                                                <>
                                                    <Eye className="h-5 w-5" />
                                                    <span>Viewed</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Eye className="h-5 w-5" />
                                                    <span>View</span>
                                                </>
                                            )}
                                        </NotificationsReadButton>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </>
    )
}
