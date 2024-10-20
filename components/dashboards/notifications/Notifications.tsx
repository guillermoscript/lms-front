import { Bell } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { createClient } from '@/utils/supabase/server'

import NotificationsReadButton from './NotificationsReadButton'

export default async function Notifications () {
    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .limit(5)
        .eq('user_id', userData?.data.user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error(error)
        return null
    }

    const filteredNotifications = notifications.filter((notification) => !notification.read)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    className="rounded-full relative border  w-8 h-8 dark:border-gray-800"
                    size="icon"
                    variant="ghost"
                    id='notifications'
                >
                    <Bell className="h-6 w-6" />
                    {filteredNotifications.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-semibold rounded-full px-1">
                            {filteredNotifications.length}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                {notifications.length === 0 ? (
                    <DropdownMenuItem>No notifications</DropdownMenuItem>
                ) : (
                    notifications.map((notification) => (
                        <DropdownMenuItem key={notification.notification_id}>
                            <NotificationsReadButton
                                notification={notification}
                            >
                                <ViewMarkdown
                                    markdown={notification.shrot_message}
                                />
                            </NotificationsReadButton>
                        </DropdownMenuItem>
                    ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                    <Link href="/dashboard/notifications">View all notifications</Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
