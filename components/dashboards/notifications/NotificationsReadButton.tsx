'use client'
import Link from 'next/link'
import { useState } from 'react'

import { notificationUpdate } from '@/actions/dashboard/notificationsActions'
import { cn } from '@/utils'
import { Tables } from '@/utils/supabase/supabase'

export default function NotificationsReadButton ({
    notification,
    children
}: {
    notification: Tables<'notifications'>
    children: React.ReactNode
}) {
    const [loading, setLoading] = useState(false)

    return (
        <Link
            onClick={async () => {
                if (notification.read) return

                setLoading(true)
                try {
                    const response = await notificationUpdate({
                        ...notification,
                        read: true
                    })
                    console.log(response)
                } catch (error) {
                    console.error(error)
                } finally {
                    setLoading(false)
                }
            }}
            className={cn(
                'flex items-center space-x-1',
                notification.read ? 'text-gray-400' : 'text-blue-500'
            )}
            href={notification.link}
        >
            {children}
        </Link>
    )
}
