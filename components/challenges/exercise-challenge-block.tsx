import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { ChallengeFriendsShare } from './challenge-friends-share'
import type { ExerciseEntry } from '@/lib/challenges/entry'

/**
 * Result-screen entry into challenges (F2): "challenge a friend" (link with the
 * member's best score) plus a compact ranking around the viewer. The caller only
 * renders it when the exercise is challengeable, the school has challenges on
 * and the student has an official attempt (`loadExerciseEntry` returned data).
 */
export async function ExerciseChallengeBlock({ exerciseId, title, entry }: { exerciseId: number; title: string; entry: ExerciseEntry }) {
  const t = await getTranslations('challenges.entry')
  const tShared = await getTranslations('challenges.shared')
  return (
    <section aria-labelledby="exercise-challenge-title" data-testid="exercise-challenge-block" className="space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <h2 id="exercise-challenge-title" className="text-base font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('position', { rank: entry.myRank, total: entry.total, score: entry.myScore })}</p>
      </div>
      <ChallengeFriendsShare exerciseId={exerciseId} title={title} />
      <div className="space-y-2">
        <ol className="divide-y rounded-lg border" data-testid="exercise-challenge-ranking">
          {entry.rows.map((r) => (
            <li key={r.userId} data-me={r.isMe ? 'true' : undefined} className={`flex items-center gap-3 px-3 py-2 text-sm ${r.isMe ? 'bg-brand-tint/40' : ''}`}>
              <span className="w-6 tabular-nums text-muted-foreground">{r.rank}</span>
              <span className="font-medium">{r.label || tShared('student')}</span>
              {r.isMe && <Badge>{tShared('you')}</Badge>}
              <span className="ml-auto font-semibold tabular-nums">{r.score}</span>
            </li>
          ))}
        </ol>
        <Link href="/dashboard/student/challenges" className="text-sm font-medium text-brand-text hover:underline">{t('seeAll')}</Link>
      </div>
    </section>
  )
}
