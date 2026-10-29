'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { claimChallenge, type ClaimChallengeOutcome } from '@/app/actions/challenge-claim'
import { joinSchoolPath } from '@/lib/auth/route-access'
import { ChallengeFriendsShare } from '@/components/challenges/challenge-friends-share'

/** Runs the post-login claim for `/reto/<token>?claim=1` and shows the outcome. */
export function ClaimResult({ token, exerciseId, title }: { token: string; exerciseId?: number; title?: string }) {
  const t = useTranslations('challenges.claim')
  const [outcome, setOutcome] = useState<ClaimChallengeOutcome | null>(null)

  useEffect(() => {
    let cancelled = false
    claimChallenge(token)
      .then((o) => !cancelled && setOutcome(o))
      .catch(() => !cancelled && setOutcome({ success: false, code: 'retry' }))
    return () => {
      cancelled = true
    }
  }, [token])

  if (!outcome) return <p className="text-sm text-muted-foreground">{t('working')}</p>

  if (!outcome.success) {
    if (outcome.code === 'not_member') {
      return (
        <div className="flex flex-col items-start gap-2">
          <p>{t('notMember')}</p>
          <Button render={<Link href={joinSchoolPath(`/reto/${encodeURIComponent(token)}?claim=1`)} />}>{t('joinCta')}</Button>
        </div>
      )
    }
    const key = {
      unauthenticated: 'signIn',
      invalid_link: 'invalidLink',
      unavailable: 'unavailable',
      no_attempt: 'noAttempt',
      banned: 'banned',
      claim_failed: 'claimFailed',
      retry: 'retry',
    } as const
    return <p role="alert">{t(key[outcome.code as keyof typeof key])}</p>
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <h2 className="text-lg font-semibold">
        {outcome.requiresPurchase ? t('paidTitle') : t('savedTitle')}
      </h2>
      {outcome.requiresPurchase ? (
        <>
          <p>{t('paidBody', { score: outcome.score })}</p>
          <Button render={<Link href={`/courses/${outcome.courseId}`} />}>{t('buyCta')}</Button>
        </>
      ) : (
        <>
          <p>{t('savedScore', { score: outcome.score })}</p>
          {outcome.accessGranted && outcome.nextExerciseId && (
            <>
              <p>{t('freeNext')}</p>
              <Button
                render={
                  <Link
                    href={`/dashboard/student/courses/${outcome.courseId}/exercises/${outcome.nextExerciseId}`}
                  />
                }
              >
                {t('nextExercise')}
              </Button>
            </>
          )}
        </>
      )}
      {exerciseId !== undefined && <ChallengeFriendsShare exerciseId={exerciseId} title={title ?? ''} />}
    </div>
  )
}
