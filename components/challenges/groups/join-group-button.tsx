'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { joinChallengeGroup } from '@/app/actions/challenge-groups'

/** One-tap join for an active school member who opened the invite link. */
export function JoinGroupButton({ token }: { token: string }) {
  const t = useTranslations('challenges.groups')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function join() {
    setError(null)
    start(async () => {
      const r = await joinChallengeGroup(token)
      if (r.success) router.push(`/dashboard/student/groups/${r.data.groupId}`)
      else setError(t(`errors.${r.code}`))
    })
  }

  return (
    <div className="space-y-2">
      <Button onClick={join} disabled={pending} className="w-full" data-testid="join-group">
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? t('join.joining') : t('join.cta')}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
