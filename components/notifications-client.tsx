"use client"

import { useState } from "react"
import { IconCheck, IconTrash, IconFilter, IconInbox } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  dismissNotification,
} from "@/app/actions/admin/notifications"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

type UserNotification = {
  id: number
  notification_id: number
  in_app_read: boolean
  dismissed_at: string | null
  created_at: string
  notification: {
    id: number
    title: string
    content: string
    type: string
    priority: string
  }
}

interface NotificationsClientProps {
  notifications: UserNotification[]
}

export function NotificationsClient({ notifications: initialNotifications }: NotificationsClientProps) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all")

  const filteredNotifications = notifications.filter((n) => {
    if (n.dismissed_at) return false
    if (filter === "unread") return !n.in_app_read
    if (filter === "read") return n.in_app_read
    return true
  })

  const unreadCount = notifications.filter((n) => !n.in_app_read && !n.dismissed_at).length

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      const result = await markNotificationAsRead(notificationId)
      if (result.success) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, in_app_read: true } : n
          )
        )
        toast.success("Notification marked as read")
      } else {
        toast.error(result.error || "Failed to mark as read")
      }
    } catch (error) {
      toast.error("An error occurred")
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      const result = await markAllNotificationsAsRead()
      if (result.success) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, in_app_read: true }))
        )
        toast.success("All notifications marked as read")
      } else {
        toast.error(result.error || "Failed to mark all as read")
      }
    } catch (error) {
      toast.error("An error occurred")
    }
  }

  const handleDismiss = async (notificationId: number) => {
    try {
      const result = await dismissNotification(notificationId)
      if (result.success) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, dismissed_at: new Date().toISOString() }
              : n
          )
        )
        toast.success("Notification dismissed")
      } else {
        toast.error(result.error || "Failed to dismiss notification")
      }
    } catch (error) {
      toast.error("An error occurred")
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "success":
        return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
      case "warning":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
      case "error":
        return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
      case "info":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
      case "alert":
        return "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "destructive"
      case "high":
        return "destructive"
      case "normal":
        return "default"
      case "low":
        return "secondary"
      default:
        return "default"
    }
  }

  return (
    <div className="space-y-6">
      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-auto">
          <TabsList>
            <TabsTrigger value="all">
              All ({notifications.filter((n) => !n.dismissed_at).length})
            </TabsTrigger>
            <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
            <TabsTrigger value="read">
              Read (
              {notifications.filter((n) => n.in_app_read && !n.dismissed_at).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
            <IconCheck className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <IconInbox className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No notifications</h3>
            <p className="text-sm text-muted-foreground">
              {filter === "unread"
                ? "You're all caught up!"
                : "No notifications to display"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredNotifications.map((notification) => (
            <Card
              key={notification.id}
              className={`${!notification.in_app_read ? "border-l-4 border-l-blue-500" : ""}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-lg">
                        {notification.notification.title}
                      </CardTitle>
                      {!notification.in_app_read && (
                        <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={getPriorityColor(notification.notification.priority) as any}
                        className="text-xs"
                      >
                        {notification.notification.priority}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${getTypeColor(notification.notification.type)}`}>
                        {notification.notification.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {!notification.in_app_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkAsRead(notification.id)}
                      >
                        <IconCheck className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismiss(notification.id)}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {notification.notification.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
