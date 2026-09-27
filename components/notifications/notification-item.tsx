'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { formatDistanceToNow } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { IconCheck, IconTrash } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  communityNotificationHref,
  communityNotificationMessage,
  communityNotificationPostLine,
  communityNotificationSnippet,
  parseCommunityNotificationMeta,
  type ViewerRole,
} from '@/lib/community/notifications'
import { useNotificationCounts } from './notification-counts'

/** One `user_notifications` row with its notification embedded (`!inner`). */
export interface NotificationRow {
  id: number
  in_app_read: boolean | null
  created_at: string
  notification: {
    id: number
    title: string
    content: string
    notification_type: string
    priority: string
    metadata: unknown
  }
}

interface NotificationItemProps {
  row: NotificationRow
  role: ViewerRole
  /** `compact` in the bell, `full` on the notifications page (with actions). */
  variant: 'compact' | 'full'
  /** The row was opened and is now read — update local state. */
  onOpened?: (id: number) => void
  /** Called before navigating away (the bell closes its popover). */
  onNavigate?: () => void
  onMarkRead?: (id: number) => void
  onDismiss?: (id: number) => void
}

/**
 * A notification in the bell and on the notifications page (#870).
 *
 * A community row is rendered from its metadata, localized, and links to the
 * exact post/comment for the viewer's role. Opening it marks it read with a
 * direct own-row update through RLS — not the server action, which would race
 * the navigation and revalidate the whole dashboard. Every other row renders
 * its stored title and content, as before.
 */
export function NotificationItem({ row, role, variant, onOpened, onNavigate, onMarkRead, onDismiss }: NotificationItemProps) {
  const t = useTranslations('dashboard.student.notifications')
  const tc = useTranslations('community')
  const locale = useLocale()
  const { userId, markedRead, refresh } = useNotificationCounts()
  const dateLocale = locale === 'es' ? es : enUS

  const n = row.notification
  const read = Boolean(row.in_app_read)
  const community = useMemo(
    () => (n.notification_type === 'community' ? parseCommunityNotificationMeta(n.metadata) : null),
    [n.notification_type, n.metadata]
  )
  const href = community ? communityNotificationHref(community, role) : null
  const when = formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: dateLocale })
  const typeLabel = t.has(`types.${n.notification_type}`) ? t(`types.${n.notification_type}`) : n.notification_type

  // Own-row update through RLS (the column grant allows in_app_read /
  // in_app_read_at). Optimistic: the counts drop now, the next read confirms.
  const markRead = () => {
    if (read || !userId) return
    onOpened?.(row.id)
    markedRead(n.notification_type)
    void createClient()
      .from('user_notifications')
      .update({ in_app_read: true, in_app_read_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('user_id', userId)
      .then(() => refresh())
  }

  const open = () => {
    onNavigate?.()
    markRead()
  }

  const unreadDot = (
    <span
      aria-hidden
      className={cn('mt-1.5 size-2 shrink-0 rounded-full', read ? 'bg-transparent' : 'bg-primary')}
    />
  )

  let body: React.ReactNode
  if (community) {
    const unknown = tc('notifications.unknownActor')
    const message = communityNotificationMessage(community, unknown)
    const snippet = communityNotificationSnippet(community, unknown)
    const postLine = communityNotificationPostLine(community)
    const staffRole = community.kind === 'community_reply' && community.staffReply ? community.actorRole : null
    body = (
      <>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn('text-foreground', read ? 'font-normal' : 'font-medium')}>
            {tc(`notifications.${message.key}`, message.values)}
          </span>
          {(staffRole === 'teacher' || staffRole === 'admin') && (
            <Badge variant="secondary" className="text-[10px]">
              {tc(staffRole === 'admin' ? 'roleBadge.admin' : 'roleBadge.teacher')}
            </Badge>
          )}
        </span>
        {postLine ? (
          <span className="block truncate text-muted-foreground">
            {tc(`notifications.${postLine.key}`, postLine.values)}
          </span>
        ) : (
          community.kind === 'community_prompt' &&
          community.postLabel && (
            <span className="block truncate text-muted-foreground">{community.postLabel}</span>
          )
        )}
        {snippet && (
          <span className={cn('block text-muted-foreground', variant === 'compact' ? 'line-clamp-1' : 'line-clamp-2')}>
            {tc('notifications.snippet', { name: snippet.name, snippet: snippet.snippet })}
          </span>
        )}
      </>
    )
  } else {
    body = (
      <>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn('text-foreground', read ? 'font-normal' : 'font-medium')}>{n.title}</span>
          {(n.priority === 'high' || n.priority === 'urgent') && (
            <Badge variant={n.priority === 'urgent' ? 'destructive' : 'secondary'} className="text-[10px]">
              {t(`priority.${n.priority}`)}
            </Badge>
          )}
        </span>
        <span
          className={cn(
            'block text-muted-foreground',
            variant === 'compact' ? 'line-clamp-2' : 'whitespace-pre-wrap'
          )}
        >
          {n.content}
        </span>
      </>
    )
  }

  const content = (
    <>
      {unreadDot}
      <span className="min-w-0 flex-1 space-y-0.5">
        {body}
        {/* Relative time differs between the server render and hydration. */}
        <span className="block text-[10px] text-muted-foreground" suppressHydrationWarning>
          {typeLabel} · {when}
        </span>
        {!read && <span className="sr-only">{t('unread')}</span>}
      </span>
    </>
  )

  const rowClass = cn(
    'flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-left text-xs outline-none',
    variant === 'compact' ? 'px-3 py-2.5' : 'px-4 py-3'
  )

  const main = href ? (
    <Link
      href={`/${locale}${href}`}
      onClick={open}
      className={cn(rowClass, 'transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/30')}
      data-testid="notification-link"
    >
      {content}
    </Link>
  ) : (
    <div className={rowClass}>{content}</div>
  )

  // A linked row is read by opening it; the page still offers the button.
  const showMarkRead = !read && (variant === 'full' || !href)
  const showDismiss = variant === 'full' && Boolean(onDismiss)

  return (
    <div
      className="flex items-start gap-1"
      data-testid="notification-item"
      data-unread={read ? 'false' : 'true'}
      data-kind={community?.kind ?? n.notification_type}
    >
      {main}
      {(showMarkRead || showDismiss) && (
        <div className={cn('flex shrink-0 gap-0.5', variant === 'compact' ? 'py-2 pr-2' : 'py-2.5 pr-3')}>
          {showMarkRead && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('actions.markAsRead')}
              title={t('actions.markAsRead')}
              onClick={() => (onMarkRead ? onMarkRead(row.id) : markRead())}
            >
              <IconCheck aria-hidden />
            </Button>
          )}
          {showDismiss && onDismiss && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('actions.dismiss')}
              title={t('actions.dismiss')}
              onClick={() => onDismiss(row.id)}
            >
              <IconTrash aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
