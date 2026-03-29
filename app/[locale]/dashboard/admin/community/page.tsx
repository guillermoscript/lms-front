import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { CommunityFeed } from '@/components/community/community-feed'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconFlag } from '@tabler/icons-react'
import Link from 'next/link'
import { CommunityTour } from '@/components/tours/community-tour'

export default async function AdminCommunityPage() {
  const t = await getTranslations('community')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = await createClient()
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

  // Fetch posts, user reactions, and flagged content count in parallel
  const [{ data: posts }, { data: userReactions }, { count: flaggedCount }] = await Promise.all([
    adminClient
      .from('community_posts')
      .select(`
        id, author_id, post_type, title, content, media_urls,
        is_pinned, is_locked, comment_count, reaction_count,
        created_at, course_id, lesson_id, is_graded,
        milestone_type, milestone_data
      `)
      .eq('tenant_id', tenantId)
      .is('course_id', null)
      .eq('is_hidden', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20),
    adminClient
      .from('community_reactions')
      .select('post_id, reaction_type')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId),
    adminClient
      .from('community_flags')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending'),
  ])

  // Collect unique author IDs and fetch profiles
  const authorIds = [...new Set((posts ?? []).map((p) => p.author_id).filter(Boolean))]
  const { data: authorProfiles } = authorIds.length > 0
    ? await adminClient
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', authorIds)
    : { data: [] }

  const profileMap = new Map(
    (authorProfiles ?? []).map((p) => [p.id, p])
  )

  const reactionsMap = new Map<string, string[]>()
  for (const r of userReactions ?? []) {
    const existing = reactionsMap.get(r.post_id) ?? []
    existing.push(r.reaction_type)
    reactionsMap.set(r.post_id, existing)
  }

  // For poll posts, fetch poll options and user votes
  const pollPostIds = (posts ?? []).filter((p) => p.post_type === 'poll').map((p) => p.id)

  let pollOptionsMap = new Map<string, Array<{ id: string; option_text: string; vote_count: number }>>()
  let userPollVotes = new Map<string, string>()

  if (pollPostIds.length > 0) {
    const [{ data: pollOptions }, { data: pollVotes }] = await Promise.all([
      adminClient
        .from('community_poll_options')
        .select('id, post_id, option_text, vote_count')
        .in('post_id', pollPostIds),
      adminClient
        .from('community_poll_votes')
        .select('post_id, option_id')
        .eq('user_id', userId)
        .in('post_id', pollPostIds),
    ])

    for (const opt of pollOptions ?? []) {
      const existing = pollOptionsMap.get(opt.post_id) ?? []
      existing.push({ id: opt.id, option_text: opt.option_text, vote_count: opt.vote_count })
      pollOptionsMap.set(opt.post_id, existing)
    }

    for (const vote of pollVotes ?? []) {
      userPollVotes.set(vote.post_id, vote.option_id)
    }
  }

  // Build enriched post objects
  const enrichedPosts = (posts ?? []).map((post) => ({
    ...post,
    media_urls: (post.media_urls as any) || [],
    author: profileMap.get(post.author_id) ?? { id: post.author_id, full_name: null, avatar_url: null },
    user_reactions: reactionsMap.get(post.id) ?? [],
    poll_options: (pollOptionsMap.get(post.id) ?? undefined) as any,
    user_voted_option: userPollVotes.get(post.id) ?? null,
  }))

  return (
    <div className="min-h-screen bg-background">
      <CommunityTour userId={userId} userRole="admin" />
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
          <div className="flex items-center justify-between" data-tour="community-header">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('schoolFeedDescription')}</p>
            </div>
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
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <CommunityFeed
          scope="school"
          initialPosts={enrichedPosts}
          initialHasMore={enrichedPosts.length >= 20}
          userRole={role}
          userId={userId}
          tenantId={tenantId}
        />
      </main>
    </div>
  )
}
