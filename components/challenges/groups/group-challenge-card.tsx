import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconCheck, IconX } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { memberChallengePath } from '@/lib/challenges/routes'
import type { GroupChallengeView } from '@/lib/challenges/groups'

/**
 * One group challenge: who played (best first), who is pending, a per-criterion
 * comparison and the viewer's OWN improvement tips. Never another person's answer.
 */
export async function GroupChallengeCard({ challenge }: { challenge: GroupChallengeView }) {
  const t = await getTranslations('challenges.groups')
  const name = (label: string | null) => (label === null ? t('guest') : label || t('student'))
  const played = challenge.myScore !== null
  return (
    <Card data-testid="group-challenge">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{challenge.title}</CardTitle>
        <Button
          size="sm"
          variant={played ? 'outline' : 'default'}
          data-testid="group-challenge-play"
          render={<Link href={memberChallengePath(challenge.linkToken)} />}
        >
          {t('page.play')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm" data-testid="group-challenge-mine">
          {played ? t('page.yourScore', { score: challenge.myScore ?? 0 }) : t('page.notPlayed')}
        </p>

        <section aria-label={t('page.players')} className="space-y-1">
          <h4 className="text-xs font-medium uppercase text-muted-foreground">{t('page.players')}</h4>
          <ul className="divide-y rounded-lg border" data-testid="group-challenge-players">
            {challenge.played.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">—</li>}
            {challenge.played.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {name(p.label)}
                  {p.isMe && <Badge variant="secondary" className="ml-2">{t('you')}</Badge>}
                  {p.won && <Badge className="ml-2">{t('page.winner')}</Badge>}
                </span>
                <span className="font-semibold tabular-nums">{p.score}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-sm text-muted-foreground" data-testid="group-challenge-pending">
          <span className="font-medium text-foreground">{t('page.pending')}: </span>
          {challenge.pending.length ? challenge.pending.map((p) => name(p.label)).join(', ') : t('page.nobodyPending')}
        </p>

        {challenge.criteria.length > 0 && challenge.played.length > 1 && (
          <details className="rounded-lg border px-3 py-2" data-testid="group-challenge-compare">
            <summary className="cursor-pointer text-sm font-medium">{t('page.compare')}</summary>
            <p className="mt-2 text-xs text-muted-foreground">{t('page.compareHint')}</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1 pr-3 font-medium" />
                    {challenge.played.map((p) => (
                      <th key={p.key} scope="col" className="px-2 py-1 text-center font-medium">{p.isMe ? t('you') : name(p.label)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {challenge.criteria.map((c, i) => (
                    <tr key={c.id} className="border-t">
                      <th scope="row" className="py-1 pr-3 text-left font-normal">{t('page.criterion', { n: i + 1 })}</th>
                      {c.byParticipant.map((b) => (
                        <td key={b.key} className="px-2 py-1 text-center">
                          {b.met === null ? '—' : b.met ? (
                            <IconCheck className="mx-auto size-4 text-success" aria-label={t('page.met')} />
                          ) : (
                            <IconX className="mx-auto size-4 text-muted-foreground" aria-label={t('page.notMet')} />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {challenge.myFeedback && (
          <section className="space-y-1" data-testid="group-challenge-tips">
            <h4 className="text-xs font-medium uppercase text-muted-foreground">{t('page.myTips')}</h4>
            {challenge.myFeedback.improvements.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {challenge.myFeedback.improvements.map((tip, i) => <li key={i}>{tip}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('page.noTips')}</p>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  )
}
