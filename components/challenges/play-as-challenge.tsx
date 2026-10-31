'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconLoader2, IconSwords } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { createPlayChallengeLink } from '@/app/actions/challenge-links'
import { memberChallengePath } from '@/lib/challenges/routes'

/**
 * Result-screen entry for a student who finished the exercise normally and has
 * no challenge attempt: opens the exercise as a challenge inside the dashboard,
 * where the first cold attempt becomes their official, ranked one.
 */
export function PlayAsChallenge({ exerciseId }: { exerciseId: number }) {
  const t = useTranslations('challenges.play')
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const res = await createPlayChallengeLink(exerciseId)
      if (!res.success) {
        setError(t('error'))
        setPending(false)
        return
      }
      router.push(memberChallengePath(res.data.token))
    } catch {
      setError(t('error'))
      setPending(false)
    }
  }

  return (
    <section aria-labelledby="play-challenge-title" data-testid="play-as-challenge" className="space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <h2 id="play-challenge-title" className="text-base font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('body')}</p>
      </div>
      <Button type="button" onClick={() => void start()} disabled={pending} aria-busy={pending} data-testid="play-as-challenge-cta">
        {pending ? <IconLoader2 className="animate-spin" /> : <IconSwords />}
        {pending ? t('opening') : t('cta')}
      </Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
