import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BlockedMembers } from '@/components/community/blocked-members'
import { CommunityFeed } from '@/components/community/community-feed'
import { CommunityUnread } from '@/components/notifications/community-unread'
import { getFeedFocus, getFeedPage } from '@/lib/community/feed'
import { parseQuestionFilter } from '@/lib/community/questions'
import { getCommunitySettings } from '@/lib/community/settings'
import { getCommunityCourses } from '@/lib/community/access'
import { CourseCommunityLinks } from '@/components/community/course-community-links'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import { CommunityTour } from '@/components/tours/community-tour'
import { getUiState } from '@/lib/supabase/ui-state'
import { isTourCompleted, areToursEnabled } from '@/lib/ui-state-keys'

interface PageProps {
  // `?post=<id>` focuses one post (#869).
  searchParams: Promise<{ post?: string | string[]; questions?: string | string[] }>
}

export default async function StudentCommunityPage({ searchParams }: PageProps) {
  const t = await getTranslations('community')
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const role = await getUserRole()

  if (role !== 'student' && role !== 'teacher' && role !== 'admin') {
    redirect('/auth/login')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Check plan features for community access
  const { data: planFeatures } = await supabase.rpc('get_plan_features', { _tenant_id: tenantId })

  if (!planFeatures?.features?.community) {
    return (
      <PageShell variant="reading">
        <PageHeader title={t('title')} description={t('schoolFeedDescription')} />
        <UpgradeNudge feature="community" currentPlan={planFeatures?.plan} />
      </PageShell>
    )
  }

  const query = await searchParams
  // `?questions=` (#875): questions, unanswered or answered ones.
  const questionFilter = parseQuestionFilter(query.questions)
  const focusPromise = getFeedFocus(query.post, { tenantId, viewerId: userId, scope: 'school' })
  const [feed, uiState, settings, courseLinks] = await Promise.all([
    getFeedPage({ tenantId, viewerId: userId, scope: 'school', questionFilter }),
    getUiState(userId),
    getCommunitySettings(tenantId),
    // #868: the course feeds this student can open (entitlements, like the
    // course feed pages' own gate). Staff reach course feeds from their courses.
    role === 'student' ? getCommunityCourses({ tenantId, userId }) : Promise.resolve([]),
  ])
  const focus = await focusPromise

  return (
    <PageShell variant="reading">
      <CommunityTour
        userId={userId}
        userRole={role as 'student' | 'teacher' | 'admin'}
        completed={isTourCompleted(uiState, 'community')}
        toursEnabled={areToursEnabled(uiState)}
      />
      <div data-tour="community-header" className="space-y-2">
        <PageHeader
          title={t('title')}
          description={t('schoolFeedDescription')}
          actions={<BlockedMembers />}
        />
        <CourseCommunityLinks courses={courseLinks} />
      </div>
      <CommunityUnread role={role} />
      <CommunityFeed
        key={questionFilter ?? 'all'}
        questionFilter={questionFilter}
        scope="school"
        tenantId={tenantId}
        initialPosts={feed.posts}
        initialHasMore={feed.hasMore}
        userRole={role}
        userId={userId}
        settings={settings}
        focusPostId={focus.focusPostId}
        focusPost={focus.focusPost}
      />
    </PageShell>
  )
}
