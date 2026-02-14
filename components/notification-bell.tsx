"use client"

import { useEffect, useState } from "react"
import { IconBell, IconCheck, IconTrash, IconInbox } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"
import { getUserNotifications, markNotificationAsRead, markAllNotificationsAsRead } from "@/app/actions/admin/notifications"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

type UserNotification = {
  id: number
  notification_id: number
  title: string
  content: string
  type: string
  priority: string
  in_app_read: boolean
  created_at: string
  notification: {
    id: number
    title: string
    content: string
    type: string
  }
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  const loadNotifications = async () => {
    try {
      const result = await getUserNotifications(false, 5)
      if (result.success && result.data) {
        setNotifications(result.data)
        setUnreadCount(result.data.filter((n: UserNotification) => !n.in_app_read).length)
      }
    } catch (error) {
      console.error("Failed to load notifications:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000)
    
    return () => clearInterval(interval)
  }, [])

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      const result = await markNotificationAsRead(notificationId)
      if (result.success) {
        setNotifications(prev =>
          prev.map(n =>
            n.id === notificationId ? { ...n, in_app_read: true } : n
          )
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch (error) {
      toast.error("Failed to mark notification as read")
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      const result = await markAllNotificationsAsRead()
      if (result.success) {
        setNotifications(prev =>
          prev.map(n => ({ ...n, in_app_read: true }))
        )
        setUnreadCount(0)
        toast.success("All notifications marked as read")
      }
    } catch (error) {
      toast.error("Failed to mark all as read")
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "success":
        return "text-green-600"
      case "warning":
        return "text-yellow-600"
      case "error":
        return "text-red-600"
      case "info":
        return "text-blue-600"
      case "alert":
        return "text-orange-600"
      default:
        return "text-gray-600"
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <Button variant="ghost" size="icon" className="relative">
          <IconBell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="text-xs"
            >
              <IconCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <p>Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <IconInbox className="h-12 w-12 mb-2 opacity-50" />
              <p>No notifications</p>
              <p className="text-xs mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-muted/50 transition-colors cursor-pointer ${
                    !notification.in_app_read ? "bg-muted/30" : ""
                  }`}
                  onClick={() => {
                    if (!notification.in_app_read) {
                      handleMarkAsRead(notification.id)
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm truncate">
                          {notification.notification.title}
                        </h4>
                        {!notification.in_app_read && (
                          <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {notification.notification.content}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={`text-xs ${getTypeColor(notification.notification.type)}`}
                        >
                          {notification.notification.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-2">
          <Link href="/dashboard/notifications" onClick={() => setIsOpen(false)}>
            <Button variant="ghost" className="w-full" size="sm">
              View all notifications
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
