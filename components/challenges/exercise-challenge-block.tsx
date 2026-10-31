import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ChallengeLeaderboard } from './challenge-leaderboard'
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
  return (
    <section aria-labelledby="exercise-challenge-title" data-testid="exercise-challenge-block" className="space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <h2 id="exercise-challenge-title" className="text-base font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('position', { rank: entry.myRank, total: entry.total, score: entry.myScore })}</p>
      </div>
      <ChallengeFriendsShare exerciseId={exerciseId} title={title} />
      <div className="space-y-2">
        <ChallengeLeaderboard
          testId="exercise-challenge-ranking"
          rows={entry.rows.map((r) => ({ key: r.userId, rank: r.rank, label: r.label, score: r.score, isMe: r.isMe }))}
        />
        <Link href="/dashboard/student/challenges" className="text-sm font-medium text-brand-text hover:underline">{t('seeAll')}</Link>
      </div>
    </section>
  )
}
