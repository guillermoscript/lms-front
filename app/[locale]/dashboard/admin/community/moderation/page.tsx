import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ModerationFlaggedContent } from './flagged-content'
import { ModerationMutedUsers } from './muted-users'

export default async function CommunityModerationPage() {
  const t = await getTranslations('community.moderation')
  const tCommunity = await getTranslations('community')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const role = await getUserRole()

  if (role !== 'admin') {
    redirect('/dashboard/admin')
  }

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  // Fetch flagged content and muted users in parallel
  const [{ data: flags }, { data: mutedUsers }] = await Promise.all([
    supabase
      .from('community_flags')
      .select('id, post_id, comment_id, reporter_id, reason, status, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('community_user_mutes')
      .select('id, user_id, muted_by, reason, muted_until, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // Collect user IDs for profile lookups
  const allUserIds = [
    ...new Set([
      ...(flags ?? []).map((f) => f.reporter_id),
      ...(mutedUsers ?? []).map((m) => m.user_id),
      ...(mutedUsers ?? []).map((m) => m.muted_by),
    ].filter(Boolean)),
  ]

  const { data: profiles } = allUserIds.length > 0
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', allUserIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  // Enrich flags
  const enrichedFlags = (flags ?? []).map((flag) => ({
    ...flag,
    reporter: profileMap.get(flag.reporter_id) ?? { id: flag.reporter_id, full_name: null, avatar_url: null },
  }))

  // Enrich muted users
  const enrichedMutedUsers = (mutedUsers ?? []).map((mute) => ({
    ...mute,
    userProfile: profileMap.get(mute.user_id) ?? { id: mute.user_id, full_name: null, avatar_url: null },
    mutedByProfile: profileMap.get(mute.muted_by) ?? { id: mute.muted_by, full_name: null, avatar_url: null },
  }))

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tCommunity('title'), href: '/dashboard/admin/community' },
                { label: t('title') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="flagged" className="space-y-6">
          <TabsList>
            <TabsTrigger value="flagged" className="gap-2">
              {t('flaggedContent')}
              {enrichedFlags.length > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 px-1.5">
                  {enrichedFlags.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="muted">
              {t('mutedUsers')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="flagged">
            <Card>
              <CardHeader>
                <CardTitle>{t('flaggedContent')}</CardTitle>
                <CardDescription>{t('description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ModerationFlaggedContent flags={enrichedFlags} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="muted">
            <Card>
              <CardHeader>
                <CardTitle>{t('mutedUsers')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ModerationMutedUsers mutedUsers={enrichedMutedUsers} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
