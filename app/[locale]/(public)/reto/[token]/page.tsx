import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { loadChallengePage } from '@/lib/challenges/public-page'
import { challengeHeadline } from '@/lib/challenges/headline'
import { buildPageMetadata } from '@/lib/seo'
import { hasPuckPage } from '@/lib/public/has-puck-page'
import { Navbar } from '@/components/public/navbar'
import { Footer } from '@/components/public/footer'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { memberChallengePath, shouldRedirectToDashboard } from '@/lib/challenges/routes'
import { isActiveMember, loadChallengeView } from '@/lib/challenges/view-data'
import { ChallengePageClient } from '@/components/challenges/challenge-page-client'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string; locale: string }>
  searchParams: Promise<{ claim?: string }>
}

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

export default async function ChallengePage({ params, searchParams }: Props) {
  const [{ token }, { claim }] = await Promise.all([params, searchParams])
  const tenantId = await getCurrentTenantId()
  const [data, userId] = await Promise.all([loadChallengePage(token, tenantId), getCurrentUserId()])
  if (!data) notFound()

  // Only an ACTIVE member can share a result; a session without membership still gets the claim CTA.
  const viewerIsMember = await isActiveMember(tenantId, userId)
  // Signed-in students live in the dashboard shell; guests and non-members keep this lightweight page.
  // `?claim=1` stays here: a member with a guest cookie still has an attempt to claim.
  const claiming = claim === '1'
  if (viewerIsMember && !claiming) {
    const role = await getUserRole()
    if (shouldRedirectToDashboard({ viewerIsMember, role, claiming })) redirect(memberChallengePath(token))
  }

  const isOwner = Boolean(userId && data.challenger?.userId && data.challenger.userId === userId)
  const [view, ownShell] = await Promise.all([
    loadChallengeView({ tenantId, exerciseId: data.exercise.id, userId, viewerIsMember }),
    // Schools with a published Puck landing skip the (public) shell, so the page brings its own.
    hasPuckPage(),
  ])

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
      rankingEntries={view.rankingEntries}
      course={view.course}
      viewerId={viewerIsMember ? userId : null}
      played={view.played}
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
