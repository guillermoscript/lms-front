import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BlockedMembers } from '@/components/community/blocked-members'
import { CommunityFeed } from '@/components/community/community-feed'
import { CommunityUnread } from '@/components/notifications/community-unread'
import { getFeedPage } from '@/lib/community/feed'
import { getCommunitySettings } from '@/lib/community/settings'
import { getCommunityCourses } from '@/lib/community/access'
import { CourseCommunityLinks } from '@/components/community/course-community-links'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import { CommunityTour } from '@/components/tours/community-tour'
import { getUiState } from '@/lib/supabase/ui-state'
import { isTourCompleted, areToursEnabled } from '@/lib/ui-state-keys'

export default async function StudentCommunityPage() {
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
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('schoolFeedDescription')}</p>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <UpgradeNudge feature="community" currentPlan={planFeatures?.plan} />
        </main>
      </div>
    )
  }

  const [feed, uiState, settings, courseLinks] = await Promise.all([
    getFeedPage({ tenantId, viewerId: userId, scope: 'school' }),
    getUiState(userId),
    getCommunitySettings(tenantId),
    // #868: the course feeds this student can open (entitlements, like the
    // course feed pages' own gate). Staff reach course feeds from their courses.
    role === 'student' ? getCommunityCourses({ tenantId, userId }) : Promise.resolve([]),
  ])

  return (
    <div className="min-h-screen bg-background">
      <CommunityTour
        userId={userId}
        userRole={role as 'student' | 'teacher' | 'admin'}
        completed={isTourCompleted(uiState, 'community')}
        toursEnabled={areToursEnabled(uiState)}
      />
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8" data-tour="community-header">
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('schoolFeedDescription')}</p>
          <div className="mt-2 -ml-3">
            <BlockedMembers />
          </div>
          <CourseCommunityLinks courses={courseLinks} />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <CommunityUnread role={role} />
        <CommunityFeed
          scope="school"
          initialPosts={feed.posts}
          initialHasMore={feed.hasMore}
          userRole={role}
          userId={userId}
          settings={settings}
        />
      </main>
    </div>
  )
}
