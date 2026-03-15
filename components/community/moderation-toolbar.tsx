'use client'

import { useState } from 'react'
import { IconPin, IconLock, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { pinPost, unpinPost, lockPost, unlockPost, hidePost } from '@/app/actions/admin/community'

interface ModerationToolbarProps {
  postId: string
  isPinned: boolean
  isLocked: boolean
  onAction?: () => void
}

export function ModerationToolbar({ postId, isPinned, isLocked, onAction }: ModerationToolbarProps) {
  const t = useTranslations('community')
  const [loading, setLoading] = useState<string | null>(null)

  async function handleAction(action: 'pin' | 'lock' | 'hide') {
    setLoading(action)
    try {
      let result
      if (action === 'pin') {
        result = isPinned ? await unpinPost(postId) : await pinPost(postId)
      } else if (action === 'lock') {
        result = isLocked ? await unlockPost(postId) : await lockPost(postId)
      } else {
        result = await hidePost(postId)
      }
      if (result.success) {
        onAction?.()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error(t('errorPosting'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-center gap-1 border-t pt-2 mt-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 text-[11px] text-muted-foreground"
        onClick={() => handleAction('pin')}
        disabled={loading !== null}
      >
        <IconPin size={12} />
        {isPinned ? t('unpin') : t('pin')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 text-[11px] text-muted-foreground"
        onClick={() => handleAction('lock')}
        disabled={loading !== null}
      >
        <IconLock size={12} />
        {isLocked ? t('unlock') : t('lock')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 text-[11px] text-destructive hover:text-destructive"
        onClick={() => handleAction('hide')}
        disabled={loading !== null}
      >
        <IconX size={12} />
        {t('hide')}
      </Button>
    </div>
  )
}
