import { createAdminClient } from '@/lib/supabase/admin'
import { getBlockedAuthorIds } from '@/lib/community/blocks'
import type { CommunityPost } from '@/components/community/community-feed'

export const FEED_PAGE_SIZE = 20

const POST_COLUMNS = `
  id, author_id, post_type, title, content, media_urls,
  is_pinned, is_locked, comment_count, reaction_count,
  created_at, course_id, lesson_id, is_graded,
  milestone_type, milestone_data
`

/**
 * One page of a community feed, enriched for `CommunityFeed` (#860).
 *
 * Reads with the service role, so the CALLER owns the access decision: the
 * viewer belongs to `tenantId` and, for a course feed, may read that course.
 * Every page and `loadMorePosts` go through here so the enrichment (author
 * role, reactions, polls) cannot drift between the first page and the rest.
 *
 * Without a cursor the page leads with pinned posts; with one it continues the
 * unpinned timeline strictly before `cursor` (a `created_at`).
 */
export async function getFeedPage({
  tenantId,
  viewerId,
  scope,
  courseId,
  cursor,
}: {
  tenantId: string
  viewerId: string
  scope: 'school' | 'course'
  courseId?: number
  cursor?: string
}): Promise<{ posts: CommunityPost[]; hasMore: boolean }> {
  const admin = createAdminClient()
  // RLS hides blocked authors, but the service role does not (#846).
  const blockedIds = await getBlockedAuthorIds(viewerId)

  let query = admin
    .from('community_posts')
    .select(POST_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('is_hidden', false)

  query = scope === 'course' && courseId ? query.eq('course_id', courseId) : query.is('course_id', null)

  if (blockedIds.length > 0) {
    query = query.not('author_id', 'in', `(${blockedIds.join(',')})`)
  }

  query = cursor
    ? query.eq('is_pinned', false).lt('created_at', cursor)
    : query.order('is_pinned', { ascending: false })

  const { data: posts, error } = await query
    .order('created_at', { ascending: false })
    .limit(FEED_PAGE_SIZE)

  if (error) throw error
  if (!posts || posts.length === 0) return { posts: [], hasMore: false }

  const authorIds = [...new Set(posts.map((p) => p.author_id))]
  const postIds = posts.map((p) => p.id)

  const [{ data: profiles }, { data: members }, { data: reactions }, { data: pollOptions }, { data: pollVotes }] =
    await Promise.all([
      admin.from('profiles').select('id, full_name, avatar_url').in('id', authorIds),
      admin.from('tenant_users').select('user_id, role').eq('tenant_id', tenantId).in('user_id', authorIds),
      admin
        .from('community_reactions')
        .select('post_id, reaction_type')
        .eq('user_id', viewerId)
        .in('post_id', postIds),
      admin
        .from('community_poll_options')
        .select('id, post_id, option_text, vote_count, sort_order')
        .in('post_id', postIds)
        .order('sort_order'),
      admin.from('community_poll_votes').select('post_id, option_id').eq('user_id', viewerId).in('post_id', postIds),
    ])

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  const roleMap = new Map((members ?? []).map((m) => [m.user_id, m.role as string]))

  const reactionsMap = new Map<string, string[]>()
  for (const r of reactions ?? []) {
    if (!r.post_id) continue
    reactionsMap.set(r.post_id, [...(reactionsMap.get(r.post_id) ?? []), r.reaction_type])
  }

  const pollOptionsMap = new Map<string, NonNullable<CommunityPost['poll_options']>>()
  for (const o of pollOptions ?? []) {
    pollOptionsMap.set(o.post_id, [...(pollOptionsMap.get(o.post_id) ?? []), o])
  }

  const pollVotesMap = new Map((pollVotes ?? []).map((v) => [v.post_id, v.option_id]))

  return {
    posts: posts.map((post) => {
      const profile = profileMap.get(post.author_id)
      return {
        ...post,
        post_type: post.post_type as CommunityPost['post_type'],
        media_urls: (post.media_urls as unknown as CommunityPost['media_urls'] | null) ?? [],
        author: {
          id: post.author_id,
          full_name: profile?.full_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          role: roleMap.get(post.author_id) ?? null,
        },
        user_reactions: reactionsMap.get(post.id) ?? [],
        poll_options: pollOptionsMap.get(post.id),
        user_voted_option: pollVotesMap.get(post.id) ?? null,
      }
    }),
    hasMore: posts.length >= FEED_PAGE_SIZE,
  }
}
