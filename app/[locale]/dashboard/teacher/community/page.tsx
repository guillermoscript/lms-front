import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CommunityFeed } from '@/components/community/community-feed'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import { CommunityTour } from '@/components/tours/community-tour'

export default async function TeacherCommunityPage() {
  const t = await getTranslations('community')
  const supabase = await createClient()
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

  // Fetch school-level posts (course_id IS NULL) and user reactions in parallel
  const [{ data: posts }, { data: userReactions }] = await Promise.all([
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
      <CommunityTour userId={userId} userRole={role as 'student' | 'teacher' | 'admin'} />
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8" data-tour="community-header">
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('schoolFeedDescription')}</p>
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
