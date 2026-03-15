'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { loadMorePosts } from '@/app/actions/community'
import { PostComposer } from './post-composer'
import { PostCard } from './post-card'
import { PostFilters } from './post-filters'
import { EmptyFeed } from './empty-feed'
import { MutedBanner } from './muted-banner'
import { PostSkeleton } from './post-skeleton'

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
  milestone_data: any
  author: { id: string; full_name: string | null; avatar_url: string | null }
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
  tenantId: string
  mutedUntil?: string | null
}

export function CommunityFeed({
  scope,
  courseId,
  initialPosts,
  initialHasMore = false,
  userRole,
  userId,
  tenantId,
  mutedUntil,
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

  // All posts = server-rendered initial + client-loaded extras
  const allPosts = [...initialPosts, ...extraPosts]

  const refreshFeed = useCallback(() => {
    setExtraPosts([])
    setHasMore(initialHasMore)
    router.refresh()
  }, [router, initialHasMore])

  // Fetch next page via server action
  const fetchNextPage = useCallback(async () => {
    if (isFetching || !hasMore) return
    setIsFetching(true)

    const lastPost = allPosts[allPosts.length - 1]
    if (!lastPost) {
      setIsFetching(false)
      return
    }

    try {
      const result = await loadMorePosts(
        tenantId,
        userId,
        scope,
        lastPost.created_at,
        courseId
      )

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
  }, [isFetching, hasMore, allPosts, tenantId, userId, scope, courseId])

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
  const filteredPosts = allPosts.filter((p) => {
    if (activeType && p.post_type !== activeType) return false
    return true
  })

  // Separate pinned and regular posts
  const pinnedPosts = filteredPosts.filter((p) => p.is_pinned)
  const regularPosts = filteredPosts.filter((p) => !p.is_pinned)
  const displayPosts = [...pinnedPosts, ...regularPosts]

  return (
    <div className="space-y-4">
      {/* Muted banner */}
      {isMuted && <MutedBanner mutedUntil={mutedUntil} />}

      {/* Composer */}
      {!isMuted && (
        <div data-tour="community-composer">
          <PostComposer scope={scope} courseId={courseId} userRole={userRole} onPostCreated={refreshFeed} />
        </div>
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
              tenantId={tenantId}
            />
          ))}

          {/* Loading skeleton for next page */}
          {isFetching && <PostSkeleton />}

          {/* Infinite scroll sentinel */}
          {hasMore && <div ref={sentinelRef} className="h-px" />}

          {/* End of feed */}
          {!hasMore && allPosts.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              {t('noMorePosts')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
