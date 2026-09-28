"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { IconCheck, IconInbox } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  dismissNotification,
} from "@/app/actions/admin/notifications"
import type { ViewerRole } from "@/lib/community/notifications"
import { useNotificationCounts } from "@/components/notifications/notification-counts"
import { applyLocalOverrides, withIds } from "@/lib/notifications/local-overrides"
import { NotificationItem, type NotificationRow } from "@/components/notifications/notification-item"
import {
  NotificationPreferences,
  type CommunityPreferences,
} from "@/components/notifications/notification-preferences"

interface NotificationsClientProps {
  notifications: NotificationRow[]
  role: ViewerRole
  preferences: CommunityPreferences
  /** The list read failed: say so, instead of "no notifications". */
  loadError?: boolean
}

type Filter = "all" | "unread" | "read"

export function NotificationsClient({
  notifications: serverRows,
  role,
  preferences,
  loadError = false,
}: NotificationsClientProps) {
  const t = useTranslations("dashboard.student.notifications")
  const router = useRouter()
  const { refresh, markedRead, markedAllRead } = useNotificationCounts()
  const [retrying, startRetry] = useTransition()

  // The server's rows, with what this tab did on top — never a one-time copy,
  // so "Try again" and a mark-all from the bell (both re-render the page's
  // props) show up here. See lib/notifications/local-overrides.ts.
  const [readIds, setReadIds] = useState<ReadonlySet<number>>(() => new Set())
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<number>>(() => new Set())
  const notifications = useMemo(
    () => applyLocalOverrides(serverRows, { read: readIds, dismissed: dismissedIds }),
    [serverRows, readIds, dismissedIds]
  )
  const [filter, setFilter] = useState<Filter>("all")

  const unreadCount = notifications.filter((n) => !n.in_app_read).length
  const readCount = notifications.length - unreadCount
  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.in_app_read
    if (filter === "read") return Boolean(n.in_app_read)
    return true
  })

  const setRead = (id: number) => setReadIds((prev) => withIds(prev, [id]))

  const handleMarkAsRead = async (id: number) => {
    try {
      const result = await markNotificationAsRead(id)
      if (result.success) {
        const row = notifications.find((n) => n.id === id)
        setRead(id)
        markedRead(row?.notification.notification_type ?? null)
        toast.success(t("toasts.markAsReadSuccess"))
      } else {
        toast.error(result.error || t("toasts.markAsReadError"))
      }
    } catch {
      toast.error(t("toasts.error"))
    } finally {
      refresh()
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      const result = await markAllNotificationsAsRead()
      if (result.success) {
        setReadIds((prev) => withIds(prev, notifications.map((n) => n.id)))
        markedAllRead()
        toast.success(t("toasts.markAllAsReadSuccess"))
      } else {
        toast.error(result.error || t("toasts.markAllAsReadError"))
      }
    } catch {
      toast.error(t("toasts.error"))
    } finally {
      refresh()
    }
  }

  const handleDismiss = async (id: number) => {
    try {
      const result = await dismissNotification(id)
      if (result.success) {
        setDismissedIds((prev) => withIds(prev, [id]))
        toast.success(t("toasts.dismissSuccess"))
      } else {
        toast.error(result.error || t("toasts.dismissError"))
      }
    } catch {
      toast.error(t("toasts.error"))
    } finally {
      refresh()
    }
  }

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="w-auto">
          <TabsList>
            <TabsTrigger value="all">
              {t("tabs.all")} ({notifications.length})
            </TabsTrigger>
            <TabsTrigger value="unread">
              {t("tabs.unread")} ({unreadCount})
            </TabsTrigger>
            <TabsTrigger value="read">
              {t("tabs.read")} ({readCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
              <IconCheck aria-hidden />
              {t("actions.markAllAsRead")}
            </Button>
          )}
          <NotificationPreferences initial={preferences} />
        </div>
      </div>

      {loadError ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("errorLoading")}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={retrying}
            onClick={() => startRetry(() => router.refresh())}
          >
            {t("retry")}
          </Button>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border px-4 py-12 text-center">
          <IconInbox aria-hidden className="mb-3 size-10 text-muted-foreground opacity-60" />
          <h2 className="mb-1 text-sm font-medium">{t("empty.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {filter === "unread" ? t("empty.caughtUp") : t("empty.none")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border" data-testid="notifications-list">
          {filteredNotifications.map((row) => (
            <li key={row.id}>
              <NotificationItem
                row={row}
                role={role}
                variant="full"
                onOpened={setRead}
                onMarkRead={handleMarkAsRead}
                onDismiss={handleDismiss}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
