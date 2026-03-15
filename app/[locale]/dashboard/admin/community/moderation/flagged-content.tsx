'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { IconUser, IconCheck, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { reviewFlag } from '@/app/actions/admin/community'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

interface Flag {
  id: string
  post_id: string | null
  comment_id: string | null
  reason: string
  status: string
  created_at: string
  reporter: { id: string; full_name: string | null; avatar_url: string | null }
}

export function ModerationFlaggedContent({ flags }: { flags: Flag[] }) {
  const t = useTranslations('community.moderation')
  const router = useRouter()

  async function handleReview(flagId: string, status: 'reviewed' | 'dismissed') {
    const result = await reviewFlag(flagId, status)
    if (result.success) {
      toast.success(t('flagReviewed'))
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  if (flags.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{t('noFlags')}</p>
  }

  return (
    <div className="space-y-4">
      {flags.map((flag) => (
        <div key={flag.id} className="flex items-start gap-4 rounded-lg border p-4">
          <Avatar className="h-8 w-8">
            <AvatarImage src={flag.reporter.avatar_url || undefined} />
            <AvatarFallback><IconUser size={14} /></AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              {t('reportedBy', { name: flag.reporter.full_name || 'User' })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('reportReason', { reason: flag.reason })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatDistanceToNow(new Date(flag.created_at), { addSuffix: true })}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleReview(flag.id, 'reviewed')}
            >
              <IconCheck size={14} className="mr-1" />
              {t('reviewFlag')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleReview(flag.id, 'dismissed')}
            >
              <IconX size={14} className="mr-1" />
              {t('dismissFlag')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
