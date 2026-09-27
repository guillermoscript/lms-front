'use client'

import { useState, useCallback, useRef, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { loadMorePosts } from '@/app/actions/community'
import { PostComposer } from './post-composer'
import { PostCard } from './post-card'
import { PostFilters } from './post-filters'
import { EmptyFeed } from './empty-feed'
import { MutedBanner } from './muted-banner'
import { PostSkeleton } from './post-skeleton'
import type { CommunitySettings } from '@/lib/community/settings'
import { parseCommentHash, splitFocusedPost } from '@/lib/community/deep-link'

export interface CommunityPost {
  id: string
  author_id: string
  post_type: 'standard' | 'discussion_prompt' | 'milestone' | 'poll'
  title: string | null
  content: string
  media_urls: { url: string; type: 'image' | 'video' | 'file'; name: string }[]
  is_pinned: boolean
  is_locked: boolean
  comment_count: number
  reaction_count: number
  created_at: string
  course_id: number | null
  lesson_id: number | null
  is_graded: boolean
  milestone_type: string | null
  milestone_data: unknown
  /** `role` is the author's role in THIS school, null when they left it. */
  author: { id: string; full_name: string | null; avatar_url: string | null; role: string | null }
  user_reactions: string[]
  poll_options?: { id: string; option_text: string; vote_count: number; sort_order: number }[]
  user_voted_option?: string | null
}

interface CommunityFeedProps {
  scope: 'school' | 'course'
  courseId?: number
  initialPosts: CommunityPost[]
  initialHasMore: boolean
  userRole: 'student' | 'teacher' | 'admin'
  userId: string
  mutedUntil?: string | null
  /** The school's student switches (#860); staff ignore them. */
  settings: CommunitySettings
  /** A valid `?post=` id (#869), whether or not this viewer can see that post. */
  focusPostId?: string | null
  /** That post, when it is in this feed for this viewer; null shows a notice. */
  focusPost?: CommunityPost | null
}

// The URL hash, read on the client only: the server never sees it, so reading
// it during render would not hydrate. `hashchange` covers the browser's own
// hash moves (a typed hash, Back between two); Next's router moves the URL
// with pushState, which fires none, so `useLocationHash` also re-reads it
// after every router navigation.
const hashListeners = new Set<() => void>()
function subscribeToHash(onChange: () => void) {
  hashListeners.add(onChange)
  window.addEventListener('hashchange', onChange)
  return () => {
    hashListeners.delete(onChange)
    window.removeEventListener('hashchange', onChange)
  }
}
const getHash = () => window.location.hash
const getServerHash = () => ''

function useLocationHash() {
  // A new object on every router navigation, hash-only ones included (Next
  // derives it from the whole URL); the effect runs once the URL has moved.
  // Without it, a link from ?post=P#comment-A to #comment-B (a second
  // notification on the same post) would keep A highlighted.
  const searchParams = useSearchParams()
  useEffect(() => {
    hashListeners.forEach((notify) => notify())
  }, [searchParams])
  return useSyncExternalStore(subscribeToHash, getHash, getServerHash)
}

export function CommunityFeed({
  scope,
  courseId,
  initialPosts,
  initialHasMore = false,
  userRole,
  userId,
  mutedUntil,
  settings,
  focusPostId = null,
  focusPost = null,
}: CommunityFeedProps) {
  const t = useTranslations('community')
  const router = useRouter()

  const [extraPosts, setExtraPosts] = useState<CommunityPost[]>([])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [isFetching, setIsFetching] = useState(false)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [activeRole, setActiveRole] = useState<string | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const isMuted = mutedUntil ? new Date(mutedUntil) > new Date() : false
  const isStudent = userRole === 'student'
  const canPost = !isStudent || scope === 'course' || settings.studentPostsSchoolFeed
  const canCreatePoll = !isStudent || settings.studentPolls

  // All posts = server-rendered initial + client-loaded extras. A deep-linked
  // post that is not on the first page leads the feed and never repeats.
  const { focused, timeline: allPosts, cursorPost } = useMemo(
    () => splitFocusedPost({ focusPost, initialPosts, extraPosts }),
    [focusPost, initialPosts, extraPosts]
  )
  const hash = useLocationHash()
  const focusCommentId = focusPostId ? parseCommentHash(hash) : null

  const refreshFeed = useCallback(() => {
    setExtraPosts([])
    setHasMore(initialHasMore)
    router.refresh()
  }, [router, initialHasMore])

  // Fetch next page via server action
  const fetchNextPage = useCallback(async () => {
    if (isFetching || !hasMore) return
    setIsFetching(true)

    if (!cursorPost) {
      setIsFetching(false)
      return
    }

    try {
      const result = await loadMorePosts(scope, cursorPost.created_at, courseId)

      if (result.success && result.data) {
        setExtraPosts((prev) => [...prev, ...result.data!.posts])
        setHasMore(result.data.hasMore)
      } else {
        setHasMore(false)
      }
    } catch {
      setHasMore(false)
    } finally {
      setIsFetching(false)
    }
  }, [isFetching, hasMore, cursorPost, scope, courseId])

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetching) {
          fetchNextPage()
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px 200px 0px' }
    )

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current)
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect()
    }
  }, [hasMore, isFetching, fetchNextPage])

  // Apply filters client-side
  const matchesFilters = (p: CommunityPost) => {
    if (activeType && p.post_type !== activeType) return false
    if (activeRole === 'teacher' && p.author.role !== 'teacher' && p.author.role !== 'admin') return false
    if (activeRole === 'student' && p.author.role !== 'student') return false
    return true
  }
  const filteredPosts = allPosts.filter(matchesFilters)

  // Separate pinned and regular posts; the deep-linked one (off page 1) leads.
  const pinnedPosts = filteredPosts.filter((p) => p.is_pinned)
  const regularPosts = filteredPosts.filter((p) => !p.is_pinned)
  const displayPosts = [
    ...(focused && matchesFilters(focused) ? [focused] : []),
    ...pinnedPosts,
    ...regularPosts,
  ]

  return (
    <div className="space-y-4">
      {/* Muted banner */}
      {isMuted && <MutedBanner mutedUntil={mutedUntil} />}

      {/* A deep link to a post this viewer cannot see here (#869) */}
      {focusPostId && !focusPost && (
        <p role="status" className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {t('lessonDiscussion.focusUnavailable')}
        </p>
      )}

      {/* Composer */}
      {!isMuted && canPost && (
        <div data-tour="community-composer">
          <PostComposer
            scope={scope}
            courseId={courseId}
            userRole={userRole}
            canCreatePoll={canCreatePoll}
            onPostCreated={refreshFeed}
          />
        </div>
      )}
      {!isMuted && !canPost && (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {t('schoolFeedStaffOnly')}
        </p>
      )}

      {/* Filters */}
      <div data-tour="community-filters">
        <PostFilters
          activeType={activeType}
          activeRole={activeRole}
          onTypeChange={setActiveType}
          onRoleChange={setActiveRole}
        />
      </div>

      {/* Feed */}
      {displayPosts.length === 0 && !isFetching ? (
        <EmptyFeed scope={scope} />
      ) : (
        <div className="space-y-4" data-tour="community-feed">
          {displayPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              userId={userId}
              userRole={userRole}
              focused={post.id === focusPostId}
              focusCommentId={post.id === focusPostId ? focusCommentId : null}
            />
          ))}

          {/* Loading skeleton for next page */}
          {isFetching && <PostSkeleton />}

          {/* Infinite scroll sentinel */}
          {hasMore && <div ref={sentinelRef} className="h-px" />}

          {/* End of feed */}
          {!hasMore && (allPosts.length > 0 || focused) && (
            <p className="text-center text-xs text-muted-foreground py-4">
              {t('noMorePosts')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
