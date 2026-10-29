import type { ChallengePageData } from './public-page'

type Translate = (key: string, values?: Record<string, string | number>) => string

/**
 * The one-line headline of a challenge, shared by the page metadata, the page
 * and the OG card so they cannot disagree:
 *  - link with a challenger score: "<Name> scored 87 on <exercise>. Can you beat it?"
 *  - OPEN link (no score): "<Name> challenges you on <exercise>. How much can you score?"
 * An open link never shows a score or an empty score.
 */
export function challengeHeadline(
  t: Translate,
  data: Pick<ChallengePageData, 'challenger' | 'creatorName' | 'exercise'>,
): string {
  const exercise = data.exercise.title
  if (data.challenger) {
    return t('challengerLine', {
      name: data.challenger.name ?? t('guestName'),
      score: data.challenger.score,
      exercise,
    })
  }
  return data.creatorName
    ? t('openLine', { name: data.creatorName, exercise })
    : t('openLineAnon', { exercise })
}
