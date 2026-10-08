'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { COMMUNITY_NOTIFICATION_TYPE, type ViewerRole } from '@/lib/community/notifications'
import { withIds } from '@/lib/notifications/local-overrides'
import { useNotificationCounts } from './notification-counts'
import { NotificationItem, type NotificationRow } from './notification-item'

/** Unread community rows listed above the feed; the notifications page has the rest. */
const LIST_LIMIT = 3

type ListState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: NotificationRow[] }

/**
 * The viewer's unread community notifications, above the school feed (#870).
 *
 * The sidebar Community entry carries the unread badge and links to the school
 * feed — where a reply on a course-feed post never appears, and where viewing
 * marks nothing read. Listing them here gives the badge somewhere to lead:
 * opening one goes to the exact post and marks it read, and the list (and the
 * badge) empty as they are read. Renders nothing while there is nothing unread
 * or the list is still loading (it is secondary to the feed below it).
 *
 * Same read as the bell: the browser client under RLS, with the explicit
 * tenant filter (notification-counts.tsx explains why).
 */
export function CommunityUnread({ role }: { role: ViewerRole }) {
  const t = useTranslations('community.notifications')
  const { counts, userId, tenantId } = useNotificationCounts()
  const unread = counts?.community ?? 0
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set())

  // Re-read whenever the count changes: a new reply arrived, or one was read
  // elsewhere (the bell, another tab).
  useEffect(() => {
    if (!unread || !userId || !tenantId) return
    let cancelled = false
    void createClient()
      .from('user_notifications')
      .select(
        'id, in_app_read, created_at, notification:notifications!inner(id, title, content, notification_type, priority, metadata, tenant_id)'
      )
      .eq('user_id', userId)
      .eq('in_app_read', false)
      .not('dismissed', 'is', true)
      .eq('notification.tenant_id', tenantId)
      .eq('notification.notification_type', COMMUNITY_NOTIFICATION_TYPE)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return
        setState(error ? { status: 'error' } : { status: 'ready', rows: (data ?? []) as unknown as NotificationRow[] })
      })
    return () => {
      cancelled = true
    }
  }, [unread, userId, tenantId])

  if (!unread || state.status === 'loading') return null
  const rows = state.status === 'ready' ? state.rows.filter((row) => !opened.has(row.id)) : []
  if (state.status === 'ready' && rows.length === 0) return null

  return (
    <section
      aria-labelledby="community-unread-heading"
      className="rounded-xl border bg-card"
      data-testid="community-unread"
    >
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <h2 id="community-unread-heading" className="text-sm font-medium">
          {t('unreadHeading')}
        </h2>
        <Link
          href="/dashboard/notifications"
          className="rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {t('viewAll')}
        </Link>
      </div>
      {state.status === 'error' ? (
        <p role="status" className="px-3 py-3 text-xs text-muted-foreground">
          {t('unreadFallback', { count: unread })}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id}>
              <NotificationItem
                row={row}
                role={role}
                variant="compact"
                onOpened={(id) => setOpened((prev) => withIds(prev, [id]))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
