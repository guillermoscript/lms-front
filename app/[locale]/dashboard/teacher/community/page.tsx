import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CommunityFeed } from '@/components/community/community-feed'
import { getFeedPage } from '@/lib/community/feed'
import { getCommunitySettings } from '@/lib/community/settings'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import { CommunityTour } from '@/components/tours/community-tour'
import { getUiState } from '@/lib/supabase/ui-state'
import { isTourCompleted, areToursEnabled } from '@/lib/ui-state-keys'

export default async function TeacherCommunityPage() {
  const t = await getTranslations('community')
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const role = await getUserRole()

  if (role !== 'teacher' && role !== 'admin') {
    redirect('/dashboard')
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

  const adminClient = createAdminClient()

  const [feed, uiState, settings] = await Promise.all([
    getFeedPage({ tenantId, viewerId: userId, scope: 'school' }),
    getUiState(userId),
    getCommunitySettings(tenantId),
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
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
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
