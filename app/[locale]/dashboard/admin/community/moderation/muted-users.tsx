'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { IconUser } from '@tabler/icons-react'
import { toast } from 'sonner'
import { unmuteUser } from '@/app/actions/admin/community'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

interface MutedUser {
  id: string
  user_id: string
  reason: string | null
  muted_until: string | null
  created_at: string
  userProfile: { id: string; full_name: string | null; avatar_url: string | null }
  mutedByProfile: { id: string; full_name: string | null; avatar_url: string | null }
}

export function ModerationMutedUsers({ mutedUsers }: { mutedUsers: MutedUser[] }) {
  const t = useTranslations('community.moderation')
  const router = useRouter()

  async function handleUnmute(userId: string) {
    const result = await unmuteUser(userId)
    if (result.success) {
      toast.success(t('userUnmuted'))
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  if (mutedUsers.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{t('noMutes')}</p>
  }

  return (
    <div className="space-y-4">
      {mutedUsers.map((mute) => (
        <div key={mute.id} className="flex items-center gap-4 rounded-lg border p-4">
          <Avatar className="h-8 w-8">
            <AvatarImage src={mute.userProfile.avatar_url || undefined} />
            <AvatarFallback><IconUser size={14} /></AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {mute.userProfile.full_name || 'User'}
            </p>
            {mute.reason && (
              <p className="text-xs text-muted-foreground">{mute.reason}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {mute.muted_until
                ? `Until ${new Date(mute.muted_until).toLocaleDateString()}`
                : 'Indefinite'}
              {' · '}
              {formatDistanceToNow(new Date(mute.created_at), { addSuffix: true })}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleUnmute(mute.user_id)}
          >
            {t('unmuteUser')}
          </Button>
        </div>
      ))}
    </div>
  )
}
