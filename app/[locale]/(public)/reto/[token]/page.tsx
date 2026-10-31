import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { loadChallengePage } from '@/lib/challenges/public-page'
import { challengeHeadline } from '@/lib/challenges/headline'
import { buildPageMetadata } from '@/lib/seo'
import { createAdminClient } from '@/lib/supabase/admin'
import { getChallengeRankingServer } from '@/lib/challenges/ranking-server'
import { loadChallengeCourse } from '@/lib/challenges/course-context'
import { trimLeaderboard } from '@/lib/challenges/leaderboard'
import { hasPuckPage } from '@/lib/public/has-puck-page'
import { Navbar } from '@/components/public/navbar'
import { Footer } from '@/components/public/footer'
import { loadViewerAttempt } from '@/lib/challenges/viewer-attempt'
import { GUEST_COOKIE, hashWithSecret, isChallengeSecretConfigured, verifyGuestToken } from '@/lib/challenges/identity'
import { ChallengePageClient } from '@/components/challenges/challenge-page-client'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string; locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token, locale } = await params
  const tenantId = await getCurrentTenantId()
  const data = await loadChallengePage(token, tenantId)
  if (!data) return { robots: { index: false, follow: false } }

  const t = await getTranslations({ locale, namespace: 'challenges.page' })
  const title = challengeHeadline(t, data)
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
  // Only an ACTIVE member can share a result; a session without membership still gets the claim CTA.
  let viewerIsMember = false
  if (userId) {
    const { data: membership } = await createAdminClient()
      .from('tenant_users')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle()
    viewerIsMember = membership?.status === 'active'
  }
  // A ranking failure must not take the challenge page down.
  const [rankingAll, course, ownShell] = await Promise.all([
    getChallengeRankingServer(tenantId, data.exercise.id).catch(() => undefined),
    loadChallengeCourse(tenantId, data.exercise.id).catch(() => null),
    // Schools with a published Puck landing skip the (public) shell, so the page brings its own.
    hasPuckPage(),
  ])
  // Same identity rule as the attempt route: an ACTIVE member plays as themself, anyone else by guest cookie.
  let guestTokenHash: string | null = null
  if (!viewerIsMember && isChallengeSecretConfigured()) {
    const presented = (await cookies()).get(GUEST_COOKIE)?.value
    if (verifyGuestToken(presented)) guestTokenHash = hashWithSecret('guest', presented)
  }
  const played = await loadViewerAttempt(createAdminClient(), tenantId, data.exercise.id, {
    userId: viewerIsMember ? userId : null,
    guestTokenHash,
  }).catch(() => null)
  const rank = played && viewerIsMember ? (rankingAll?.find((e) => e.userId === userId)?.rank ?? null) : null
  const rankingEntries = rankingAll ? trimLeaderboard(rankingAll, userId) : undefined

  const page = (
    <ChallengePageClient
      token={data.link.token}
      exerciseId={data.exercise.id}
      title={data.exercise.title}
      instructions={data.exercise.instructions}
      passingScore={data.exercise.passingScore}
      creatorName={data.creatorName}
      challenger={data.challenger ? { score: data.challenger.score, passed: data.challenger.passed, name: data.challenger.name } : null}
      isOwner={isOwner}
      viewerIsMember={viewerIsMember}
      rankingEntries={rankingEntries}
      course={course}
      viewerId={viewerIsMember ? userId : null}
      played={played ? { score: played.score, passed: played.passed, answer: played.answer, feedback: played.feedback, rank } : null}
    />
  )
  if (!ownShell) return page
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1">{page}</main>
      <Footer />
    </div>
  )
}
