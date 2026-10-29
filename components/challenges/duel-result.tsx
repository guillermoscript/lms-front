import { useTranslations } from 'next-intl'
import { compareDuel } from '@/lib/challenges/ranking'
import { cn } from '@/lib/utils'

interface DuelResultProps {
  /** Viewer's score (0-100). */
  mine: number
  /** Challenger's score (0-100). */
  theirs: number
  /** Challenger's display name (first name + initial, or "Invitado"). */
  theirName: string
  className?: string
}

/** Head-to-head result. Under 3 points apart is "Empate técnico". */
export function DuelResult({ mine, theirs, theirName, className }: DuelResultProps) {
  const t = useTranslations('challenges.ranking')
  const { outcome, diff } = compareDuel(mine, theirs)

  return (
    <section
      aria-live="polite"
      className={cn('rounded-xl border border-border bg-card p-4 text-center space-y-3', className)}
    >
      <h3 className="text-lg font-bold">
        {outcome === 'tie'
          ? t('duel.tie')
          : outcome === 'mine'
            ? t('duel.youWin')
            : t('duel.theyWin', { name: theirName })}
      </h3>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-muted-foreground">{t('duel.you')}</dt>
          <dd className="text-2xl font-bold tabular-nums">{mine}</dd>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <dt className="truncate text-muted-foreground">{theirName}</dt>
          <dd className="text-2xl font-bold tabular-nums">{theirs}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        {outcome === 'tie' ? t('duel.tieHint') : t('duel.diff', { diff })}
      </p>
    </section>
  )
}
