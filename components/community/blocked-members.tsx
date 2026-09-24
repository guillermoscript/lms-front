'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconBan, IconUser } from '@tabler/icons-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getBlockedMembers, unblockUser } from '@/app/actions/community'

type BlockedMember = { id: string; full_name: string | null; avatar_url: string | null }

/**
 * "Blocked members (n)" — where a member undoes a block (#846). Renders
 * nothing until they have blocked someone.
 */
export function BlockedMembers() {
  const t = useTranslations('community')
  const router = useRouter()
  const [members, setMembers] = useState<BlockedMember[]>([])
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    getBlockedMembers().then((result) => {
      if (result.success && result.data) setMembers(result.data.members)
    })
  }, [])

  async function handleUnblock(id: string) {
    setPending(id)
    const result = await unblockUser(id)
    setPending(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    const rest = members.filter((m) => m.id !== id)
    setMembers(rest)
    if (rest.length === 0) setOpen(false)
    toast.success(t('unblocked'))
    router.refresh()
  }

  if (members.length === 0) return null

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <IconBan size={14} />
        {t('blockedMembers')} ({members.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('blockedMembers')}</DialogTitle>
            <DialogDescription>{t('blockedMembersDescription')}</DialogDescription>
          </DialogHeader>
          <ul className="divide-y">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback>
                      <IconUser size={14} />
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">
                    {member.full_name || t('unknownUser')}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending === member.id}
                  onClick={() => handleUnblock(member.id)}
                >
                  {t('unblock')}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
