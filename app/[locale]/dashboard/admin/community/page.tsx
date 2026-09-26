import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { CommunityFeed } from '@/components/community/community-feed'
import { getFeedPage } from '@/lib/community/feed'
import { getCommunitySettings } from '@/lib/community/settings'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconFlag } from '@tabler/icons-react'
import Link from 'next/link'
import { CommunityTour } from '@/components/tours/community-tour'
import { CommunitySettingsDialog } from '@/components/community/community-settings-dialog'
import { getUiState } from '@/lib/supabase/ui-state'
import { isTourCompleted, areToursEnabled } from '@/lib/ui-state-keys'

export default async function AdminCommunityPage() {
  const t = await getTranslations('community')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const role = await getUserRole()

  if (role !== 'admin') {
    redirect('/dashboard/admin')
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
            <div className="mb-4">
              <AdminBreadcrumb
                items={[
                  { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                  { label: t('title') },
                ]}
              />
            </div>
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

  // Use admin client to bypass RLS (JWT tenant_id may not match subdomain tenant)
  const adminClient = createAdminClient()

  // Fetch the feed and the flagged content count in parallel
  const [feed, { count: flaggedCount }, uiState, settings] = await Promise.all([
    getFeedPage({ tenantId, viewerId: userId, scope: 'school' }),
    adminClient
      .from('community_flags')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending'),
    getUiState(userId),
    getCommunitySettings(tenantId),
  ])

  return (
    <div className="min-h-screen bg-background">
      <CommunityTour
        userId={userId}
        userRole="admin"
        completed={isTourCompleted(uiState, 'community')}
        toursEnabled={areToursEnabled(uiState)}
      />
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: t('title') },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3" data-tour="community-header">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('schoolFeedDescription')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <CommunitySettingsDialog settings={settings} />
              <Link href="/dashboard/admin/community/moderation" data-tour="community-moderation">
                <Button variant="outline" className="gap-2">
                  <IconFlag className="h-4 w-4" />
                  {t('moderation.title')}
                  {(flaggedCount ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5">
                      {flaggedCount}
                    </Badge>
                  )}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <CommunityFeed
          scope="school"
          initialPosts={feed.posts}
          initialHasMore={feed.hasMore}
          userRole={role}
          userId={userId}
          tenantId={tenantId}
          settings={settings}
        />
      </main>
    </div>
  )
}
