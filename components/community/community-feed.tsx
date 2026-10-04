'use client'

import { useState, useCallback, useRef, useEffect, useMemo, useSyncExternalStore } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconArrowUp } from '@tabler/icons-react'
import { loadMorePosts } from '@/app/actions/community'
import type { loadNewPosts } from '@/app/actions/community'
import { Button } from '@/components/ui/button'
import { useRealtimeInserts } from '@/hooks/use-realtime-inserts'
import { PostComposer } from './post-composer'
import { PostCard } from './post-card'
import { PostFilters } from './post-filters'
import { EmptyFeed } from './empty-feed'
import { MutedBanner } from './muted-banner'
import { PostSkeleton } from './post-skeleton'
import type { CommunitySettings } from '@/lib/community/settings'
import { parseCommentHash, scrollBehavior, splitFocusedPost } from '@/lib/community/deep-link'
import { matchesQuestionFilter, QUESTION_FILTER_PARAM, type QuestionFilter } from '@/lib/community/questions'
import type { ViewerPromptGrade } from '@/lib/community/prompt-grades'
import {
  feedInsertFilter,
  isFeedInsertSignal,
  mergePendingPosts,
  newestCreatedAt,
  REALTIME_DEBOUNCE_MS,
  unseenLivePosts,
} from '@/lib/community/realtime'

export interface CommunityPost {
  id: string
  author_id: string
  post_type: 'standard' | 'discussion_prompt' | 'milestone' | 'poll' | 'question'
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
  /** A question's accepted answer (#875); null for everything else. */
  accepted_comment_id: string | null
  /** A graded prompt's optional due date (#873). */
  due_at: string | null
  /** The VIEWER's own grade on a graded prompt (#873); never anyone else's. */
  viewer_grade?: ViewerPromptGrade | null
  /** `role` is the author's role in THIS school, null when they left it. */
  author: { id: string; full_name: string | null; avatar_url: string | null; role: string | null }
  user_reactions: string[]
  poll_options?: { id: string; option_text: string; vote_count: number; sort_order: number }[]
  user_voted_option?: string | null
}

interface CommunityFeedProps {
  scope: 'school' | 'course'
  courseId?: number
  /** This school — the school feed's realtime channel is narrowed to it (#876). */
  tenantId: string
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
  /**
   * `?questions=` (#875): the server already narrowed `initialPosts` to it.
   * The page keys the feed on it, so changing it starts a fresh feed.
   */
  questionFilter?: QuestionFilter | null
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
  tenantId,
  initialPosts,
  initialHasMore = false,
  userRole,
  userId,
  mutedUntil,
  settings,
  focusPostId = null,
  focusPost = null,
  questionFilter = null,
}: CommunityFeedProps) {
  const t = useTranslations('community')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [extraPosts, setExtraPosts] = useState<CommunityPost[]>([])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [isFetching, setIsFetching] = useState(false)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [activeRole, setActiveRole] = useState<string | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const feedTopRef = useRef<HTMLDivElement>(null)

  // #876: posts others published since this page loaded. `pendingPosts` wait
  // behind the "N new posts" pill (nothing moves under the reader);
  // `livePosts` are the ones the reader brought in by pressing it.
  const [pendingPosts, setPendingPosts] = useState<CommunityPost[]>([])
  const [livePosts, setLivePosts] = useState<CommunityPost[]>([])

  const isMuted = mutedUntil ? new Date(mutedUntil) > new Date() : false
  const isStudent = userRole === 'student'
  const canPost = !isStudent || scope === 'course' || settings.studentPostsSchoolFeed
  const canCreatePoll = !isStudent || settings.studentPolls

  // All posts = server-rendered initial + client-loaded extras. A deep-linked
  // post that is not on the first page leads the feed and never repeats.
  const { focused, timeline: allPosts, cursorPost } = useMemo(
    () =>
      splitFocusedPost({
        focusPost,
        initialPosts: [...unseenLivePosts(livePosts, initialPosts), ...initialPosts],
        extraPosts,
      }),
    [focusPost, initialPosts, extraPosts, livePosts]
  )
  const hash = useLocationHash()
  const focusCommentId = focusPostId ? parseCommentHash(hash) : null

  const refreshFeed = useCallback(() => {
    setExtraPosts([])
    setLivePosts([])
    setPendingPosts([])
    setHasMore(initialHasMore)
    router.refresh()
  }, [router, initialHasMore])

  // ---- Live feed (#876) ---------------------------------------------------
  // What is on screen and waiting, read by the (debounced) re-read below
  // without re-subscribing the channel on every render.
  const knownRef = useRef({ shown: [] as CommunityPost[], pending: [] as CommunityPost[] })
  useEffect(() => {
    knownRef.current = { shown: focused ? [focused, ...allPosts] : allPosts, pending: pendingPosts }
  })
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkForNewPosts = useCallback(async () => {
    const { shown, pending } = knownRef.current
    // Nothing on screen yet: anything published since the page rendered.
    const since = newestCreatedAt([...shown, ...pending]) ?? new Date(0).toISOString()
    try {
      const params = new URLSearchParams({ scope, since })
      if (courseId !== undefined) params.set('courseId', String(courseId))
      if (questionFilter) params.set('questions', questionFilter)
      const response = await fetch(`/api/community/new-posts?${params}`, { cache: 'no-store' })
      const result: Awaited<ReturnType<typeof loadNewPosts>> = await response.json()
      if (!result.success || !result.data || result.data.posts.length === 0) return
      const incoming = result.data.posts
      const shownIds = new Set(knownRef.current.shown.map((p) => p.id))
      setPendingPosts((prev) => mergePendingPosts(prev, incoming, { shownIds, viewerId: userId }))
    } catch {
      // A missed live update is not an error: the next event or a reload catches up.
    }
  }, [scope, courseId, questionFilter, userId])

  const scheduleCheck = useCallback(() => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    checkTimerRef.current = setTimeout(() => {
      checkTimerRef.current = null
      void checkForNewPosts()
    }, REALTIME_DEBOUNCE_MS)
  }, [checkForNewPosts])

  useEffect(
    () => () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current)
    },
    []
  )

  useRealtimeInserts({
    table: 'community_posts',
    filter: feedInsertFilter({ scope, tenantId, courseId }),
    onInsert: (row) => {
      if (isFeedInsertSignal(row, { scope, courseId, viewerId: userId })) scheduleCheck()
    },
    // On every (re)join: posts published between the server render (or a
    // dropped connection) and now.
    onSubscribed: () => scheduleCheck(),
  })

  const showPendingPosts = useCallback(() => {
    setLivePosts((prev) => [...pendingPosts, ...prev])
    setPendingPosts([])
    // Only when the reader is below the top of the feed; never away from the composer.
    requestAnimationFrame(() => {
      const top = feedTopRef.current
      if (top && top.getBoundingClientRect().top < 0) {
        top.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
      }
    })
  }, [pendingPosts])

  // Fetch next page via server action
  const fetchNextPage = useCallback(async () => {
    if (isFetching || !hasMore) return
    setIsFetching(true)

    if (!cursorPost) {
      setIsFetching(false)
      return
    }

    try {
      const result = await loadMorePosts(scope, cursorPost.created_at, courseId, questionFilter)

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
  }, [isFetching, hasMore, cursorPost, scope, courseId, questionFilter])

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

  // The question filters live in the URL (the teacher dashboard links to them)
  // and are applied by the server; a deep link (`?post=`) is dropped with them.
  const setQuestionFilter = useCallback(
    (next: QuestionFilter | null) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('post')
      if (next) params.set(QUESTION_FILTER_PARAM, next)
      else params.delete(QUESTION_FILTER_PARAM)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  const handleTypeChange = (type: string | null) => {
    setActiveType(type)
    if (questionFilter) setQuestionFilter(null)
  }

  const handleQuestionFilterChange = (next: QuestionFilter | null) => {
    setActiveType(null)
    setQuestionFilter(next)
  }

  // Apply filters client-side
  const matchesFilters = (p: CommunityPost) => {
    if (!matchesQuestionFilter(p, questionFilter)) return false
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
      <div ref={feedTopRef} data-tour="community-filters" className="scroll-mt-24">
        <PostFilters
          activeType={activeType}
          activeRole={activeRole}
          questionFilter={questionFilter}
          onTypeChange={handleTypeChange}
          onRoleChange={setActiveRole}
          onQuestionFilterChange={handleQuestionFilterChange}
        />
      </div>

      {/* New posts from others (#876) — shown on request, so the page never jumps */}
      <div role="status" aria-live="polite" className="sticky top-2 z-20 flex justify-center empty:hidden">
        {pendingPosts.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5 rounded-full shadow-md"
            onClick={showPendingPosts}
            data-testid="community-new-posts"
          >
            <IconArrowUp size={14} aria-hidden />
            {t('newPosts', { count: pendingPosts.length })}
          </Button>
        )}
      </div>

      {/* Feed */}
      {displayPosts.length === 0 && !isFetching ? (
        <EmptyFeed scope={scope} message={questionFilter ? t(`questions.empty.${questionFilter}`) : undefined} />
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
