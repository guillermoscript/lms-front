import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'

export interface RetoLeaderboardEntry {
  key: string
  /** null = guest ("Invitado"), '' = member without a name. */
  label: string | null
  score: number
  isMe?: boolean
  /** Score difference vs the viewer (viewer − entry); omitted when not relevant. */
  delta?: number | null
  isGuest?: boolean
}

/**
 * Leaderboard shared by staff, student and (later) public reto surfaces.
 * Presentational and server-rendered: callers decide which labels are safe to show.
 */
export async function RetoLeaderboard({ entries, testId = 'reto-leaderboard' }: { entries: RetoLeaderboardEntry[]; testId?: string }) {
  const t = await getTranslations('challenges.shared')
  if (!entries.length) return <p className="text-sm text-muted-foreground">{t('leaderboardEmpty')}</p>
  return (
    <ol className="divide-y rounded-lg border" data-testid={testId}>
      {entries.map((e, i) => (
        <li key={e.key} data-me={e.isMe ? 'true' : undefined} className={`flex items-center gap-3 px-3 py-2 text-sm ${e.isMe ? 'bg-brand-tint/40' : ''}`}>
          <span className="w-6 tabular-nums text-muted-foreground">{i + 1}</span>
          <span className="font-medium">{e.label === null ? t('guest') : e.label || t('student')}</span>
          {e.isMe && <Badge>{t('you')}</Badge>}
          {e.delta != null && !e.isMe && (
            <span className={`text-xs tabular-nums ${e.delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : e.delta < 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}>
              {e.delta > 0 ? t('ahead', { points: e.delta }) : e.delta < 0 ? t('behind', { points: -e.delta }) : t('tied')}
            </span>
          )}
          <span className="ml-auto font-semibold tabular-nums">{e.score}</span>
        </li>
      ))}
    </ol>
  )
}
