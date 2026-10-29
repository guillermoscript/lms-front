'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { fetchChallengeRanking, type RankingEntry } from '@/lib/challenges/ranking'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RankingProps {
  /** `exercises.id` to rank. Scoped to the viewer's tenant by the RPC. */
  exerciseId: number
  /** Highlights the viewer's own row. */
  currentUserId?: string
  className?: string
}

/** Per-exercise challenge ranking (score desc, earliest first). Not XP-based. */
export function Ranking({ exerciseId, currentUserId, className }: RankingProps) {
  const t = useTranslations('challenges.ranking')
  const [entries, setEntries] = useState<RankingEntry[] | null>(null)
  const [error, setError] = useState(false)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchChallengeRanking(createClient(), exerciseId).then(
      (rows) => {
        if (!cancelled) setEntries(rows)
      },
      () => {
        if (!cancelled) setError(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [exerciseId, attempt])

  return (
    <section aria-labelledby="challenge-ranking-title" className={cn('space-y-3', className)}>
      <h3 id="challenge-ranking-title" className="text-sm font-semibold">
        {t('title')}
      </h3>
      {error ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-destructive">{t('error')}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(false)
              setEntries(null)
              setAttempt((n) => n + 1)
            }}
          >
            {t('retry')}
          </Button>
        </div>
      ) : entries === null ? (
        <div role="status" aria-label={t('loading')} className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {entries.map((e) => {
            const mine = e.userId === currentUserId
            return (
              <li
                key={e.userId}
                aria-current={mine ? 'true' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm',
                  mine && 'bg-brand-tint',
                )}
              >
                <span className="w-6 text-right font-semibold tabular-nums">{e.rank}</span>
                <span className="min-w-0 flex-1 truncate">
                  {e.displayName}
                  {mine && <span className="ml-2 text-xs text-muted-foreground">{t('you')}</span>}
                </span>
                <span className="font-semibold tabular-nums">
                  {e.score}
                  <span className="sr-only"> {t('points')}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
