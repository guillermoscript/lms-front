import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import type { StaffChallengeAttempt } from '@/lib/challenges/staff'

/** Challenge plays for staff: player, score, official/practice, answer, AI feedback. Server-rendered. */
export async function StaffAttemptList({ attempts, locale, limited }: { attempts: StaffChallengeAttempt[]; locale: string; limited?: boolean }) {
  const t = await getTranslations('challenges.staff')
  if (!attempts.length) {
    return <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">{t('attemptsEmpty')}</p>
  }
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="space-y-3">
      {limited && <p className="text-xs text-muted-foreground">{t('attemptsLimited', { count: attempts.length })}</p>}
      <ul className="space-y-3">
        {attempts.map((a) => (
          <li key={a.id} data-testid="challenge-attempt" className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.playerName ?? (a.isGuest ? t('guest') : t('member'))}</span>
              <Badge variant="outline">{a.isGuest ? t('guest') : t('member')}</Badge>
              <Badge variant={a.isOfficial ? 'default' : 'secondary'}>{a.isOfficial ? t('official') : t('practice')}</Badge>
              <span className="ml-auto text-sm font-semibold tabular-nums">{t('score', { score: a.score })}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              <time dateTime={a.createdAt}>{fmt.format(new Date(a.createdAt))}</time>
              {a.linkPath && <> · <a className="underline underline-offset-2" href={a.linkPath} target="_blank" rel="noreferrer">{t('viewLink')}</a></>}
            </p>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('answer')}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{a.answer || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('feedback')}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{a.feedback || t('noFeedback')}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
