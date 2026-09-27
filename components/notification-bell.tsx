"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { IconBell, IconInbox } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { markAllNotificationsAsRead } from "@/app/actions/admin/notifications"
import { formatBadgeCount, type ViewerRole } from "@/lib/community/notifications"
import { useNotificationCounts } from "@/components/notifications/notification-counts"
import { NotificationItem, type NotificationRow } from "@/components/notifications/notification-item"

/** Rows the popover lists; the notifications page has the rest. */
const BELL_LIMIT = 8

type BellState =
  | { status: "idle" | "loading" | "error" }
  | { status: "ready"; rows: NotificationRow[] }

/**
 * Header bell (#870): unread count for this school, and the latest few
 * notifications on open.
 *
 * The count comes from the shared poll (notification-counts.tsx); the list is
 * read lazily when the popover opens, with the browser client under RLS and
 * the same explicit tenant filter — a member of two schools only ever sees the
 * school they are in.
 */
export function NotificationBell({ role }: { role: ViewerRole }) {
  const t = useTranslations("dashboard.student.notifications")
  const { counts, userId, tenantId, refresh, markedAllRead } = useNotificationCounts()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<BellState>({ status: "idle" })
  const [markingAll, setMarkingAll] = useState(false)

  const unread = counts?.unread ?? 0

  const loadRows = useCallback(async () => {
    if (!userId || !tenantId) {
      setState({ status: "error" })
      return
    }
    setState({ status: "loading" })
    const { data, error } = await createClient()
      .from("user_notifications")
      .select(
        "id, in_app_read, created_at, notification:notifications!inner(id, title, content, notification_type, priority, metadata, tenant_id)"
      )
      .eq("user_id", userId)
      .not("dismissed", "is", true)
      .eq("notification.tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(BELL_LIMIT)
    if (error) {
      setState({ status: "error" })
      return
    }
    setState({ status: "ready", rows: (data ?? []) as unknown as NotificationRow[] })
  }, [userId, tenantId])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      void loadRows()
      refresh()
    }
  }

  const handleOpened = (id: number) => {
    setState((current) =>
      current.status === "ready"
        ? { ...current, rows: current.rows.map((r) => (r.id === id ? { ...r, in_app_read: true } : r)) }
        : current
    )
  }

  const handleMarkAll = async () => {
    setMarkingAll(true)
    try {
      const result = await markAllNotificationsAsRead()
      if (!result.success) {
        toast.error(result.error || t("toasts.markAllAsReadError"))
        return
      }
      markedAllRead()
      setState((current) =>
        current.status === "ready"
          ? { ...current, rows: current.rows.map((r) => ({ ...r, in_app_read: true })) }
          : current
      )
    } catch {
      toast.error(t("toasts.markAllAsReadError"))
    } finally {
      setMarkingAll(false)
      refresh()
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={t("bell.label", { count: unread })}
            data-testid="notification-bell"
          />
        }
      >
        <IconBell aria-hidden className="size-4" />
        {unread > 0 && (
          <span
            aria-hidden
            data-testid="notification-bell-count"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-tint px-1 text-[10px] font-medium tabular-nums text-brand-text ring-2 ring-background"
          >
            {formatBadgeCount(unread)}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
        data-testid="notification-popover"
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-medium">{t("bell.title")}</h2>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={handleMarkAll} disabled={markingAll}>
              {t("bell.markAllRead")}
            </Button>
          )}
        </div>

        <div className="max-h-[min(26rem,60vh)] overflow-y-auto" aria-live="polite" aria-busy={state.status === "loading"}>
          {(state.status === "loading" || state.status === "idle") && (
            <div className="space-y-3 px-3 py-3">
              <span className="sr-only">{t("bell.loading")}</span>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <Skeleton className="mt-1.5 size-2 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {state.status === "error" && (
            <div role="alert" className="flex flex-col items-center gap-2 px-3 py-6 text-center">
              <p className="text-muted-foreground">{t("bell.error")}</p>
              <Button variant="outline" size="sm" onClick={() => void loadRows()}>
                {t("bell.retry")}
              </Button>
            </div>
          )}

          {state.status === "ready" && state.rows.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 px-3 py-8 text-center text-muted-foreground">
              <IconInbox aria-hidden className="size-6 opacity-60" />
              <p>{t("bell.empty")}</p>
            </div>
          )}

          {state.status === "ready" && state.rows.length > 0 && (
            <ul className="divide-y divide-border">
              {state.rows.map((row) => (
                <li key={row.id}>
                  <NotificationItem
                    row={row}
                    role={role}
                    variant="compact"
                    onOpened={handleOpened}
                    onNavigate={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            nativeButton={false}
            render={<Link href="/dashboard/notifications" />}
            onClick={() => setOpen(false)}
          >
            {t("bell.viewAll")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
