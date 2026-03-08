'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  IconBell,
  IconTrash,
  IconSend,
  IconClock,
} from '@tabler/icons-react'
import { deleteNotification, dispatchNotification } from '@/app/actions/admin/notifications'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ConfirmDialog } from './confirm-dialog'

interface Notification {
  id: number
  title: string
  content: string
  notification_type: string
  priority: string
  status: string
  target_type: string
  sent_at: string | null
  scheduled_for: string | null
  created_at: string
  created_by_user?: {
    full_name: string
    email: string
  }
  course?: {
    title: string
  }
}

interface NotificationsListProps {
  notifications: Notification[]
}

export default function NotificationsList({ notifications }: NotificationsListProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.admin.notifications')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'announcement':
        return 'bg-blue-500'
      case 'alert':
        return 'bg-red-500'
      case 'success':
        return 'bg-green-500'
      case 'warning':
        return 'bg-yellow-500'
      case 'error':
        return 'bg-red-600'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-500'
      case 'scheduled':
        return 'bg-orange-500'
      case 'draft':
        return 'bg-gray-500'
      case 'cancelled':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  async function handleSendNotification(id: number) {
    try {
      const result = await dispatchNotification(id)
      if (result.success) {
        toast.success(t('list.toasts.sent', { count: result.data?.usersNotified || 0 }))
        router.refresh()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('list.toasts.error'))
    }
  }

  async function handleDelete(id: number) {
    try {
      const result = await deleteNotification(id)
      if (result.success) {
        toast.success(t('list.toasts.deleted'))
        setDeletingId(null)
        router.refresh()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('list.toasts.deleteError'))
    }
  }

  if (!notifications || notifications.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <IconBell className="mx-auto mb-4 h-12 w-12 opacity-50" />
        <p>{t('list.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="rounded-lg border p-4 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{notification.title}</h3>
                <Badge className={`${getTypeBadgeColor(notification.notification_type)} text-white`}>
                  {t(`types.${notification.notification_type}`)}
                </Badge>
                <Badge className={`${getStatusBadgeColor(notification.status)} text-white`}>
                  {t(`list.status.${notification.status}`)}
                </Badge>
                {notification.priority === 'urgent' && (
                  <Badge variant="destructive">{t('priority.urgent')}</Badge>
                )}
                {notification.priority === 'high' && (
                  <Badge className="bg-orange-500 text-white">{t('priority.high')}</Badge>
                )}
              </div>

              {/* Content */}
              <p className="text-sm text-muted-foreground line-clamp-2">
                {notification.content}
              </p>

              {/* Metadata */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {t('list.metadata.target')}: <strong>{t(`targets.${notification.target_type}`)}</strong>
                  {notification.course && ` - ${notification.course.title}`}
                </span>
                {notification.sent_at && (
                  <span>
                    {t('list.metadata.sent')}: {new Date(notification.sent_at).toLocaleString()}
                  </span>
                )}
                {notification.scheduled_for && !notification.sent_at && (
                  <span>
                    <IconClock className="inline h-3 w-3 mr-1" />
                    {t('list.metadata.scheduled')}: {new Date(notification.scheduled_for).toLocaleString()}
                  </span>
                )}
                <span>
                  {t('list.metadata.created')}: {new Date(notification.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {notification.status === 'draft' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSendNotification(notification.id)}
                  aria-label={t('list.send')}
                >
                  <IconSend className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeletingId(notification.id)}
                aria-label={t('list.delete')}
              >
                <IconTrash className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => { if (!open) setDeletingId(null) }}
        title={t('list.confirmDeleteTitle')}
        description={t('list.confirmDelete')}
        confirmText={t('list.confirmDeleteAction')}
        variant="destructive"
        onConfirm={() => deletingId !== null && handleDelete(deletingId)}
      />
    </div>
  )
}
