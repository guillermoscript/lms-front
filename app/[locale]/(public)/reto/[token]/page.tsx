import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { loadChallengePage } from '@/lib/challenges/public-page'
import { buildPageMetadata } from '@/lib/seo'
import { getChallengeRankingServer } from '@/lib/challenges/ranking-server'
import { ChallengePageClient } from '@/components/challenges/challenge-page-client'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string; locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token, locale } = await params
  const tenantId = await getCurrentTenantId()
  const data = await loadChallengePage(token, tenantId)
  if (!data) return { robots: { index: false, follow: false } }

  const t = await getTranslations({ locale, namespace: 'challenges.page' })
  const name = data.challenger?.name ?? t('guestName')
  const title = data.challenger
    ? t('challengerLine', { name, score: data.challenger.score, exercise: data.exercise.title })
    : data.exercise.title
  const metadata = await buildPageMetadata({
    title,
    description: t('metaDescription'),
    ogParams: { type: 'challenge', token, locale },
  })
  return { ...metadata, robots: { index: false, follow: false } }
}

export default async function ChallengePage({ params }: Props) {
  const { token } = await params
  const tenantId = await getCurrentTenantId()
  const [data, userId] = await Promise.all([loadChallengePage(token, tenantId), getCurrentUserId()])
  if (!data) notFound()

  const isOwner = Boolean(userId && data.challenger?.userId && data.challenger.userId === userId)
  // A ranking failure must not take the challenge page down.
  const rankingEntries = await getChallengeRankingServer(tenantId, data.exercise.id).catch(() => undefined)

  return (
    <ChallengePageClient
      token={data.link.token}
      exerciseId={data.exercise.id}
      title={data.exercise.title}
      instructions={data.exercise.instructions}
      passingScore={data.exercise.passingScore}
      challenger={data.challenger ? { score: data.challenger.score, passed: data.challenger.passed, name: data.challenger.name } : null}
      isOwner={isOwner}
      rankingEntries={rankingEntries}
    />
  )
}
