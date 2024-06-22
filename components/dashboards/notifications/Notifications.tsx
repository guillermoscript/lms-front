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

    const { data: notifications, error } = await supabase.from('notifications').select('*').limit(5)

    if (error) {
        console.error(error)
        return null
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    className="rounded-full border border-gray-200 w-8 h-8 dark:border-gray-800"
                    size="icon"
                    variant="ghost"
                >
                    <Bell className="h-6 w-6" />
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
