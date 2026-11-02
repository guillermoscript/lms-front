import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { GroupLeaderboardRow } from '@/lib/challenges/group-leaderboard'

/** Average score + challenges won. Names are first name + initial; unclaimed guests are "Guest/Invitado". */
export async function GroupLeaderboard({ rows }: { rows: GroupLeaderboardRow[] }) {
  const t = await getTranslations('challenges.groups')
  const label = (r: GroupLeaderboardRow) => (r.label === null ? t('guest') : r.label || t('student'))
  if (!rows.some((r) => r.played > 0)) {
    return <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground" data-testid="group-leaderboard-empty">{t('page.noPlayers')}</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border" data-testid="group-leaderboard">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">{t('page.rank')}</TableHead>
            <TableHead>{t('page.name')}</TableHead>
            <TableHead className="text-right">{t('page.average')}</TableHead>
            <TableHead className="text-right">{t('page.won')}</TableHead>
            <TableHead className="text-right">{t('page.played')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} data-testid="group-leaderboard-row" data-me={r.isMe ? 'true' : undefined} className={cn(r.isMe && 'bg-muted/50 font-medium')}>
              <TableCell className="tabular-nums">{r.rank ?? '—'}</TableCell>
              <TableCell>
                {label(r)}
                {r.isMe && <Badge variant="secondary" className="ml-2">{t('you')}</Badge>}
              </TableCell>
              <TableCell className="text-right tabular-nums" data-testid="group-average">{r.average ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums" data-testid="group-won">{r.won}</TableCell>
              <TableCell className="text-right tabular-nums">{r.played}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
