'use client'

import { useState, useEffect, useRef } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  IconUser,
  IconSend,
  IconDots,
  IconCornerDownRight,
  IconFlag,
  IconBan,
  IconMessageCircle,
  IconCircleCheck,
  IconBulb,
} from '@tabler/icons-react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { FlagDialog } from './flag-dialog'
import { buttonVariants } from '@/components/ui/button'
import {
  blockUser,
  createComment,
  deleteComment,
  getComments,
  setAcceptedAnswer,
  toggleReaction,
} from '@/app/actions/community'
import { Badge } from '@/components/ui/badge'
import { canAcceptAnswers, rankAnswers } from '@/lib/community/questions'
import { commentAnchorId, scrollBehavior } from '@/lib/community/deep-link'
import { CommunityMarkdown, CommunityMarkdownField } from './community-markdown'
import { MentionTextarea } from './mention-textarea'
import { useRealtimeInserts } from '@/hooks/use-realtime-inserts'
import { isThreadInsertSignal, REALTIME_DEBOUNCE_MS, threadInsertFilter } from '@/lib/community/realtime'

type CommunityT = ReturnType<typeof useTranslations<'community'>>

interface CommentUser {
  id: string
  full_name: string | null
  avatar_url: string | null
}

interface Comment {
  id: string
  content: string
  created_at: string
  author_id: string
  parent_comment_id: string | null
  author: CommentUser
  /** The author's role in this school; null when they left it. */
  authorRole: string | null
  helpful_count: number
  replies?: Comment[]
}

/** A question thread's state (#875); null for every other kind of post. */
interface QuestionState {
  acceptedCommentId: string | null
  /** The viewer may accept / un-accept (the author or staff). */
  canAccept: boolean
  viewerHelpful: Set<string>
}

/** Mirrors MAX_COMMENT_LENGTH in app/actions/community.ts. */
const MAX_COMMENT_LENGTH = 2000

interface CommentThreadProps {
  postId: string
  userId: string
  isLocked: boolean
  userRole: string
  /**
   * `staff` is the feed's dense register (the default). `learner` is the
   * lesson page's (#869): 16px text, 40px targets, a labelled submit button
   * and comment actions that do not hide until hover.
   */
  variant?: 'staff' | 'learner'
  /** Where the comment is written; the lesson skips revalidation (see `createComment`). */
  surface?: 'feed' | 'lesson'
  placeholder?: string
  composerLabel?: string
  emptyText?: string
  submitLabel?: string
  autoFocusComposer?: boolean
  onCommentCreated?: (commentId: string, meta: { isReply: boolean }) => void
  /** After every successful load (post, delete, block included): the visible top-level comments. */
  onCommentsLoaded?: (roots: { id: string; author_id: string }[]) => void
  /** A deep-linked comment (#869): scrolled to, focused and highlighted once loaded. */
  focusCommentId?: string | null
  /** A question's accepted answer changed here (#875), so the card's badge can follow. */
  onAcceptedChange?: (commentId: string | null) => void
}

export function CommentThread({
  postId,
  userId,
  isLocked,
  userRole,
  variant = 'staff',
  surface = 'feed',
  placeholder,
  composerLabel,
  emptyText,
  submitLabel,
  autoFocusComposer = false,
  onCommentCreated,
  onCommentsLoaded,
  focusCommentId = null,
  onAcceptedChange,
}: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [question, setQuestion] = useState<QuestionState | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [flagTarget, setFlagTarget] = useState<{ id: string; type: 'comment' } | null>(null)
  // The deep-linked comment is brought into view once, after the first load.
  const focusHandledRef = useRef<string | null>(null)
  // The comment this reader just posted, brought into view after the reload.
  const justPostedRef = useRef<string | null>(null)

  const t = useTranslations('community')
  const tGamification = useTranslations('components.gamification')
  const locale = useLocale()
  const isLearner = variant === 'learner'

  useEffect(() => {
    loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  // #876: someone else's comment on this post arrives live. The event is only
  // a signal — the thread re-reads through `getComments`, which drops hidden
  // comments and blocked authors; one channel per open thread, gone on close.
  const liveReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleLiveReload = () => {
    if (liveReloadRef.current) clearTimeout(liveReloadRef.current)
    liveReloadRef.current = setTimeout(() => {
      liveReloadRef.current = null
      loadComments({ silent: true })
    }, REALTIME_DEBOUNCE_MS)
  }
  useEffect(() => () => {
    if (liveReloadRef.current) clearTimeout(liveReloadRef.current)
  }, [])
  useRealtimeInserts({
    table: 'community_comments',
    filter: threadInsertFilter(postId),
    onInsert: (row) => {
      if (isThreadInsertSignal(row, { postId, viewerId: userId })) scheduleLiveReload()
    },
    // Back after a dropped connection: catch up on what was missed.
    onSubscribed: (first) => {
      if (!first) scheduleLiveReload()
    },
  })

  useEffect(() => {
    if (loading || !focusCommentId || focusHandledRef.current === focusCommentId) return
    // After paint, so the comment is in the DOM. The ref is set inside the
    // frame: a cancelled first run (Strict Mode) must not count as handled.
    const frame = requestAnimationFrame(() => {
      focusHandledRef.current = focusCommentId
      const el = document.getElementById(commentAnchorId(focusCommentId))
      if (!el) return // removed, or by someone the reader blocked
      el.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
      el.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [loading, comments, focusCommentId])

  useEffect(() => {
    const id = justPostedRef.current
    if (!id) return
    const frame = requestAnimationFrame(() => {
      justPostedRef.current = null
      document.getElementById(commentAnchorId(id))?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() })
    })
    return () => cancelAnimationFrame(frame)
  }, [comments])

  /** `silent` reloads keep the list on screen instead of flashing the skeleton. */
  async function loadComments({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) setLoading(true)
    try {
      const result = await getComments(postId)
      if (!result.success || !result.data) {
        setComments([])
        return
      }

      const { comments: commentsData, profiles, meta } = result.data
      onCommentsLoaded?.(commentsData.filter((c) => c.parent_comment_id === null))
      const isQuestion = meta.postType === 'question'
      setQuestion(
        isQuestion
          ? {
              acceptedCommentId: meta.acceptedCommentId,
              canAccept: canAcceptAnswers({
                viewerId: userId,
                viewerRole: userRole,
                questionAuthorId: meta.postAuthorId,
              }),
              viewerHelpful: new Set(meta.viewerHelpful),
            }
          : null
      )
      if (commentsData.length === 0) {
        setComments([])
        return
      }

      const profilesMap = new Map(profiles.map((p) => [p.id, p]))

      const allComments: Comment[] = commentsData.map((c) => ({
        ...c,
        author: profilesMap.get(c.author_id) || {
          id: c.author_id,
          full_name: null,
          avatar_url: null,
        },
        authorRole: meta.roles[c.author_id] ?? null,
        helpful_count: meta.helpfulCounts[c.id] ?? 0,
      }))

      // Build tree
      const rootComments = allComments.filter((c) => c.parent_comment_id === null)
      const replyMap = new Map<string, Comment[]>()

      allComments.forEach((c) => {
        if (c.parent_comment_id) {
          const replies = replyMap.get(c.parent_comment_id) || []
          replies.push(c)
          replyMap.set(c.parent_comment_id, replies)
        }
      })

      const attachReplies = (comment: Comment): Comment => {
        const replies = replyMap.get(comment.id) || []
        return {
          ...comment,
          replies: replies.map(attachReplies),
        }
      }

      setComments(
        rankAnswers(rootComments.map(attachReplies), {
          isQuestion,
          acceptedCommentId: meta.acceptedCommentId,
        })
      )
    } catch (error) {
      console.error('Error loading comments:', error)
      toast.error(t('errorLoading'))
    } finally {
      setLoading(false)
    }
  }

  async function handleBlock(author: CommentUser) {
    if (!confirm(t('blockConfirm', { name: author.full_name || t('unknownUser') }))) return
    const result = await blockUser(author.id)
    if (result.success) {
      toast.success(t('blocked'))
      loadComments({ silent: true })
    } else {
      toast.error(result.error)
    }
  }

  async function handlePost(content: string, parentId: string | null = null) {
    if (!content.trim() || isLocked) return

    setSubmitting(true)
    try {
      const result = await createComment(postId, content.trim(), parentId || undefined, { surface })
      if (!result.success) {
        toast.error(result.error || t('errorPosting'))
        return
      }

      setNewComment('')
      setReplyingTo(null)
      // #874: the XP this comment earned (0 past a daily cap).
      const xp = result.data?.xp
      if (xp && xp.amount > 0) {
        toast.success(
          xp.action === 'community_prompt_answer'
            ? tGamification('xpAwarded.community_prompt_answer', { xp: xp.amount })
            : tGamification('xpAwarded.community', { xp: xp.amount })
        )
      }
      const newId = result.data?.id
      if (newId && isLearner) justPostedRef.current = newId
      await loadComments({ silent: true })
      if (newId) onCommentCreated?.(newId, { isReply: Boolean(parentId) })
    } catch (error) {
      console.error('Error posting comment:', error)
      toast.error(t('errorPosting'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAccept(commentId: string | null) {
    if (accepting) return
    setAccepting(true)
    try {
      const result = await setAcceptedAnswer(postId, commentId)
      if (!result.success) {
        toast.error(result.error || t('errorPosting'))
        return
      }
      toast.success(commentId ? t('questions.accepted') : t('questions.unaccepted'))
      onAcceptedChange?.(commentId)
      await loadComments({ silent: true })
    } catch {
      toast.error(t('errorPosting'))
    } finally {
      setAccepting(false)
    }
  }

  async function handleHelpful(commentId: string) {
    try {
      const result = await toggleReaction('comment', commentId, 'helpful')
      if (!result.success) {
        toast.error(result.error || t('errorPosting'))
        return
      }
      await loadComments({ silent: true })
    } catch {
      toast.error(t('errorPosting'))
    }
  }

  async function handleDelete(commentId: string) {
    try {
      const result = await deleteComment(commentId)
      if (!result.success) {
        toast.error(result.error || t('errorPosting'))
        return
      }
      await loadComments({ silent: true })
      toast.success(t('postDeleted'))
    } catch {
      toast.error(t('errorPosting'))
    }
  }

  return (
    <div className="space-y-4 pt-3 border-t">
      {/* Comment form */}
      {!isLocked && isLearner && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            handlePost(newComment)
          }}
        >
          <CommunityMarkdownField value={newComment} previewClassName="min-h-24 text-base">
            <MentionTextarea
              value={newComment}
              onValueChange={setNewComment}
              mentionContext={{ postId }}
              placeholder={placeholder ?? t('writeReply')}
              aria-label={composerLabel ?? t('writeReply')}
              maxLength={MAX_COMMENT_LENGTH}
              // Only when the reader opened the thread on purpose ("Answer").
              autoFocus={autoFocusComposer}
              className="min-h-24 resize-y text-base leading-relaxed md:text-base md:leading-relaxed"
            />
          </CommunityMarkdownField>
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              className="h-10 px-4 text-sm"
              disabled={submitting || !newComment.trim()}
            >
              {submitLabel ?? t('reply')}
            </Button>
          </div>
        </form>
      )}

      {!isLocked && !isLearner && (
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback>
              <IconUser size={14} />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 flex gap-2">
            <CommunityMarkdownField value={newComment} previewClassName="min-h-[60px] text-xs">
              <MentionTextarea
                value={newComment}
                onValueChange={setNewComment}
                mentionContext={{ postId }}
                placeholder={placeholder ?? t('writeReply')}
                aria-label={composerLabel ?? t('writeReply')}
                maxLength={MAX_COMMENT_LENGTH}
                autoFocus={autoFocusComposer}
                className="min-h-[60px] resize-y text-xs"
              />
            </CommunityMarkdownField>
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 self-end"
              onClick={() => handlePost(newComment)}
              disabled={submitting || !newComment.trim()}
              aria-label={submitLabel ?? t('reply')}
            >
              <IconSend size={14} />
            </Button>
          </div>
        </div>
      )}

      {isLocked && (
        <p className={cn('text-muted-foreground text-center py-2', isLearner ? 'text-sm' : 'text-xs')}>
          {t('lockedMessage')}
        </p>
      )}

      {/* Comments */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-8 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className={cn('text-muted-foreground text-center py-4', isLearner ? 'text-sm' : 'text-xs')}>
          {emptyText ?? t('noComments')}
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              postId={postId}
              comment={comment}
              userId={userId}
              userRole={userRole}
              locale={locale}
              t={t}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              onReply={handlePost}
              onDelete={handleDelete}
              onFlag={(id) => setFlagTarget({ id, type: 'comment' })}
              onBlock={handleBlock}
              submitting={submitting}
              isLocked={isLocked}
              isLearner={isLearner}
              focusCommentId={focusCommentId}
              question={question}
              accepting={accepting}
              onAccept={handleAccept}
              onHelpful={handleHelpful}
            />
          ))}
        </div>
      )}

      {flagTarget && (
        <FlagDialog
          targetType="comment"
          targetId={flagTarget.id}
          open={true}
          onOpenChange={(open) => !open && setFlagTarget(null)}
        />
      )}
    </div>
  )
}

// -------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------

function CommentReplyForm({
  postId,
  onSubmit,
  submitting,
  t,
  isLearner,
}: {
  postId: string
  onSubmit: (content: string) => void
  submitting: boolean
  t: CommunityT
  isLearner: boolean
}) {
  const [content, setContent] = useState('')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!content.trim()) return
        onSubmit(content)
        setContent('')
      }}
      className="flex-1 flex gap-2"
    >
      <CommunityMarkdownField
        value={content}
        previewClassName={isLearner ? 'min-h-16 text-base' : 'min-h-[50px] text-xs'}
      >
        <MentionTextarea
          value={content}
          onValueChange={setContent}
          mentionContext={{ postId }}
          placeholder={t('writeReply')}
          aria-label={t('writeReply')}
          maxLength={MAX_COMMENT_LENGTH}
          className={cn(
            'resize-y',
            isLearner ? 'min-h-16 text-base md:text-base' : 'min-h-[50px] text-xs'
          )}
          autoFocus
        />
      </CommunityMarkdownField>
      <Button
        type="submit"
        size="icon"
        // Tonal on the lesson: its next action stays the one filled element.
        variant={isLearner ? 'secondary' : 'default'}
        className={cn('shrink-0 self-end', isLearner ? 'size-10' : 'h-7 w-7')}
        disabled={submitting || !content.trim()}
        aria-label={t('reply')}
      >
        <IconSend size={isLearner ? 16 : 12} />
      </Button>
    </form>
  )
}

interface CommentItemProps {
  postId: string
  comment: Comment
  depth?: number
  userId: string
  userRole: string
  locale: string
  t: CommunityT
  replyingTo: string | null
  setReplyingTo: (id: string | null) => void
  onReply: (content: string, parentId: string) => void
  onDelete: (commentId: string) => void
  onFlag: (commentId: string) => void
  onBlock: (author: CommentUser) => void
  submitting: boolean
  isLocked: boolean
  isLearner: boolean
  focusCommentId: string | null
  question: QuestionState | null
  accepting: boolean
  onAccept: (commentId: string | null) => void
  onHelpful: (commentId: string) => void
}

function CommentItem({
  postId,
  comment,
  depth = 0,
  userId,
  userRole,
  locale,
  t,
  replyingTo,
  setReplyingTo,
  onReply,
  onDelete,
  onFlag,
  onBlock,
  submitting,
  isLocked,
  isLearner,
  focusCommentId,
  question,
  accepting,
  onAccept,
  onHelpful,
}: CommentItemProps) {
  const isOwn = userId === comment.author_id
  const isReplying = replyingTo === comment.id
  const canModerate = userRole === 'admin' || userRole === 'teacher'
  const isFocused = focusCommentId === comment.id
  // Only a top-level comment answers a question; replies are follow-ups.
  const isAnswer = question !== null && depth === 0
  const isAccepted = isAnswer && question.acceptedCommentId === comment.id
  const authorIsStaff = comment.authorRole === 'teacher' || comment.authorRole === 'admin'
  const markedHelpful = isAnswer && question.viewerHelpful.has(comment.id)

  return (
    <div
      id={commentAnchorId(comment.id)}
      // Focusable only as a deep-link target, so it is announced on arrival.
      tabIndex={isFocused ? -1 : undefined}
      data-focused={isFocused ? '' : undefined}
      data-accepted={isAccepted ? '' : undefined}
      className={cn(
        'flex gap-2.5 group/comment scroll-mt-24 outline-none',
        depth > 0 && 'mt-3',
        isAccepted && 'rounded-lg border border-success/40 bg-success/5 p-3',
        isFocused && 'rounded-md bg-muted p-2 ring-1 ring-ring/40'
      )}
    >
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={comment.author.avatar_url || undefined} />
        <AvatarFallback>
          <IconUser size={12} />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-1 min-w-0">
        {isAccepted && (
          <p
            className={cn(
              'flex items-center gap-1 font-medium text-success',
              isLearner ? 'text-sm' : 'text-[11px]'
            )}
          >
            <IconCircleCheck size={isLearner ? 16 : 12} aria-hidden />
            {t('questions.acceptedAnswer')}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('font-semibold', isLearner ? 'text-sm' : 'text-xs')}>
              {comment.author.full_name || t('unknownUser')}
            </span>
            {authorIsStaff && (
              <Badge variant="secondary" className="text-[10px]">
                {t(comment.authorRole === 'admin' ? 'roleBadge.admin' : 'roleBadge.teacher')}
              </Badge>
            )}
            <span className={cn('text-muted-foreground', isLearner ? 'text-xs' : 'text-[11px]')}>
              {formatDistanceToNow(new Date(comment.created_at), {
                addSuffix: true,
                ...(locale === 'es' ? { locale: es } : {}),
              })}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t('commentActions')}
              className={cn(
                isLearner
                  ? cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-10')
                  : cn(
                      buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                      'opacity-0 group-hover/comment:opacity-100 focus-visible:opacity-100 transition-opacity'
                    )
              )}
            >
              <IconDots size={isLearner ? 16 : 12} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwn && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(comment.id)}
                >
                  {t('deletePost')}
                </DropdownMenuItem>
              )}
              {!isOwn && (
                <DropdownMenuItem onClick={() => onFlag(comment.id)}>
                  <IconFlag size={12} />
                  {t('flag')}
                </DropdownMenuItem>
              )}
              {!isOwn && !canModerate && (
                <DropdownMenuItem onClick={() => onBlock(comment.author)}>
                  <IconBan size={12} />
                  {t('block')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CommunityMarkdown
          content={comment.content}
          className={isLearner ? 'text-sm' : 'text-xs'}
          collapsible
        />

        {(!isLocked || isAnswer) && (
          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            {!isLocked && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'hover:bg-transparent text-muted-foreground hover:text-foreground',
                  isLearner ? 'min-h-10 px-0 text-sm' : 'h-auto px-0 py-0.5 text-[11px]'
                )}
                onClick={() => setReplyingTo(isReplying ? null : comment.id)}
              >
                <IconMessageCircle size={isLearner ? 16 : 12} className="mr-1" />
                {t('reply')}
              </Button>
            )}
            {isAnswer && (
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={markedHelpful}
                className={cn(
                  'hover:bg-transparent hover:text-foreground',
                  markedHelpful ? 'text-foreground' : 'text-muted-foreground',
                  isLearner ? 'min-h-10 px-0 text-sm' : 'h-auto px-0 py-0.5 text-[11px]'
                )}
                onClick={() => onHelpful(comment.id)}
              >
                <IconBulb size={isLearner ? 16 : 12} className="mr-1" />
                {comment.helpful_count > 0
                  ? t('questions.helpfulCount', { count: comment.helpful_count })
                  : t('questions.helpful')}
              </Button>
            )}
            {isAnswer && question.canAccept && (
              <Button
                variant="ghost"
                size="sm"
                disabled={accepting}
                className={cn(
                  'hover:bg-transparent',
                  isAccepted ? 'text-muted-foreground hover:text-foreground' : 'text-success hover:text-success',
                  isLearner ? 'min-h-10 px-0 text-sm' : 'h-auto px-0 py-0.5 text-[11px]'
                )}
                onClick={() => onAccept(isAccepted ? null : comment.id)}
              >
                <IconCircleCheck size={isLearner ? 16 : 12} className="mr-1" />
                {isAccepted ? t('questions.unaccept') : t('questions.accept')}
              </Button>
            )}
          </div>
        )}

        {isReplying && (
          <div className="flex gap-2 mt-2 animate-in fade-in slide-in-from-top-1">
            <div className="w-6 shrink-0 flex justify-end">
              <IconCornerDownRight size={12} className="text-muted-foreground/50 mt-2" />
            </div>
            <CommentReplyForm
              postId={postId}
              t={t}
              submitting={submitting}
              isLearner={isLearner}
              onSubmit={(content) => onReply(content, comment.id)}
            />
          </div>
        )}

        {/* Nested replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="space-y-3 pt-2">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                postId={postId}
                comment={reply}
                depth={depth + 1}
                userId={userId}
                userRole={userRole}
                locale={locale}
                t={t}
                replyingTo={replyingTo}
                setReplyingTo={setReplyingTo}
                onReply={onReply}
                onDelete={onDelete}
                onFlag={onFlag}
                onBlock={onBlock}
                submitting={submitting}
                isLocked={isLocked}
                isLearner={isLearner}
                focusCommentId={focusCommentId}
                question={question}
                accepting={accepting}
                onAccept={onAccept}
                onHelpful={onHelpful}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
