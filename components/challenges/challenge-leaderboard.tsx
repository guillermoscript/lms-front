'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { NEIGHBOURS, windowAround, type LeaderboardRow } from '@/lib/challenges/leaderboard'

interface Props {
  /** Already ordered (score desc, earliest first). Rendered as given, not re-sorted. */
  rows: LeaderboardRow[]
  /** Show the viewer's row +/- 3 neighbours (or the top rows without a viewer) with a "show all" toggle. */
  windowed?: boolean
  /** Visible "Ranking" heading. */
  heading?: boolean
  testId?: string
  className?: string
}

/**
 * The one challenge leaderboard (public page, dashboard route, student and
 * staff views, exercise result block). Exact-score order; the 3-point tie band
 * applies only to the duel, deliberately. Guests render as "Guest", members
 * without a name as "Student".
 */
export function ChallengeLeaderboard({ rows, windowed = false, heading = false, testId = 'reto-leaderboard', className }: Props) {
  const t = useTranslations('challenges.shared')
  const tr = useTranslations('challenges.ranking')
  const [all, setAll] = useState(false)
  const titleId = useId()

  const numbered = rows.map((r, i) => ({ ...r, rank: r.rank ?? i + 1 }))
  const shown = windowed && !all ? windowAround(numbered.map((r) => ({ ...r, isMe: Boolean(r.isMe) })), NEIGHBOURS) : numbered
  const truncated = windowed && shown.length < numbered.length

  return (
    <section aria-labelledby={heading ? titleId : undefined} className={cn('space-y-3', className)}>
      {heading ? (
        <h3 id={titleId} className="text-sm font-semibold">
          {tr('title')}
        </h3>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr('empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border" data-testid={testId}>
          <Table className="text-sm">
            <TableHeader className="sr-only">
              <TableRow>
                <TableHead scope="col">{tr('columns.rank')}</TableHead>
                <TableHead scope="col">{tr('columns.name')}</TableHead>
                <TableHead scope="col">{tr('columns.score')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.key} data-me={r.isMe ? 'true' : undefined} className={cn(r.isMe && 'bg-brand-tint/40')}>
                  <TableCell className="w-10 px-3 py-2 text-right font-semibold tabular-nums text-muted-foreground">{r.rank}</TableCell>
                  <TableCell className="max-w-0 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.label === null ? t('guest') : r.label || t('student')}</span>
                      {r.isMe ? <Badge>{t('you')}</Badge> : null}
                      {r.delta != null && !r.isMe ? (
                        <span className={cn('shrink-0 text-xs tabular-nums', r.delta > 0 ? 'text-success' : r.delta < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {r.delta > 0 ? t('ahead', { points: r.delta }) : r.delta < 0 ? t('behind', { points: -r.delta }) : t('tied')}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="w-16 px-3 py-2 text-right font-semibold tabular-nums">{r.score}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {windowed && (truncated || all) && rows.length > 0 ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setAll((v) => !v)} aria-pressed={all} data-testid="leaderboard-toggle">
          {all ? t('showNearby') : t('showAll', { count: rows.length })}
        </Button>
      ) : null}
    </section>
  )
}
