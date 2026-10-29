import { useTranslations } from 'next-intl'
import type { RankingEntry } from '@/lib/challenges/ranking'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RankingProps {
  /** Already ordered (score desc, earliest first). Rendered as given, not re-sorted. */
  entries: RankingEntry[]
  /** Highlights (and labels) the viewer's own row. */
  currentUserId?: string
  status?: 'ready' | 'loading' | 'error'
  /** Shown with the error state when provided. */
  onRetry?: () => void
  className?: string
}

/**
 * Presentational per-exercise ranking. Exact-score order; the 3-point tie band
 * applies only to the duel, deliberately. Feed it from
 * `getChallengeRankingServer` (public pages) or `MemberRanking` (dashboard).
 */
export function Ranking({ entries, currentUserId, status = 'ready', onRetry, className }: RankingProps) {
  const t = useTranslations('challenges.ranking')

  return (
    <section aria-labelledby="challenge-ranking-title" className={cn('space-y-3', className)}>
      <h3 id="challenge-ranking-title" className="text-sm font-semibold">
        {t('title')}
      </h3>
      {status === 'error' ? (
        <div role="alert" className="space-y-2 text-sm">
          <p className="text-destructive">{t('error')}</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t('retry')}
            </Button>
          )}
        </div>
      ) : status === 'loading' ? (
        <div role="status" aria-label={t('loading')} className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">{t('columns.rank')}</th>
                <th scope="col">{t('columns.name')}</th>
                <th scope="col">{t('columns.score')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => {
                const mine = e.userId === currentUserId
                return (
                  <tr key={e.userId} className={cn(mine && 'bg-brand-tint')}>
                    <td className="w-10 px-3 py-2 text-right font-semibold tabular-nums">{e.rank}</td>
                    <td className="max-w-0 px-3 py-2">
                      <span className="block truncate">
                        {e.displayName || t('anonymous')}
                        {mine && <span className="ml-2 text-xs text-muted-foreground">{t('you')}</span>}
                      </span>
                    </td>
                    <td className="w-16 px-3 py-2 text-right font-semibold tabular-nums">{e.score}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
