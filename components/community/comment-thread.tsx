'use client'

import { useState, useEffect, useRef } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
} from '@tabler/icons-react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { FlagDialog } from './flag-dialog'
import { buttonVariants } from '@/components/ui/button'
import { blockUser, createComment, deleteComment, getComments } from '@/app/actions/community'
import { commentAnchorId, scrollBehavior } from '@/lib/community/deep-link'

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
  replies?: Comment[]
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
  /** A deep-linked comment (#869): scrolled to, focused and highlighted once loaded. */
  focusCommentId?: string | null
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
  focusCommentId = null,
}: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([])
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
  const locale = useLocale()
  const isLearner = variant === 'learner'

  useEffect(() => {
    loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

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

      const { comments: commentsData, profiles } = result.data
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

      setComments(rootComments.map(attachReplies))
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
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={placeholder ?? t('writeReply')}
            aria-label={composerLabel ?? t('writeReply')}
            maxLength={MAX_COMMENT_LENGTH}
            // Only when the reader opened the thread on purpose ("Answer").
            autoFocus={autoFocusComposer}
            className="min-h-24 resize-y text-base leading-relaxed md:text-base md:leading-relaxed"
          />
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
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={placeholder ?? t('writeReply')}
              aria-label={composerLabel ?? t('writeReply')}
              maxLength={MAX_COMMENT_LENGTH}
              autoFocus={autoFocusComposer}
              className="min-h-[60px] resize-none text-xs"
            />
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
  onSubmit,
  submitting,
  t,
  isLearner,
}: {
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
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('writeReply')}
        aria-label={t('writeReply')}
        maxLength={MAX_COMMENT_LENGTH}
        className={cn(
          'resize-none',
          isLearner ? 'min-h-16 text-base md:text-base' : 'min-h-[50px] text-xs'
        )}
        autoFocus
      />
      <Button
        type="submit"
        size="icon"
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
}

function CommentItem({
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
}: CommentItemProps) {
  const isOwn = userId === comment.author_id
  const isReplying = replyingTo === comment.id
  const canModerate = userRole === 'admin' || userRole === 'teacher'
  const isFocused = focusCommentId === comment.id

  return (
    <div
      id={commentAnchorId(comment.id)}
      // Focusable only as a deep-link target, so it is announced on arrival.
      tabIndex={isFocused ? -1 : undefined}
      data-focused={isFocused ? '' : undefined}
      className={cn(
        'flex gap-2.5 group/comment scroll-mt-24 outline-none',
        depth > 0 && 'mt-3',
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('font-semibold', isLearner ? 'text-sm' : 'text-xs')}>
              {comment.author.full_name || t('unknownUser')}
            </span>
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

        <p
          className={cn(
            'leading-relaxed whitespace-pre-wrap text-foreground/90 break-words',
            isLearner ? 'text-sm' : 'text-xs'
          )}
        >
          {comment.content}
        </p>

        {!isLocked && (
          <div className="flex items-center gap-3 pt-0.5">
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
          </div>
        )}

        {isReplying && (
          <div className="flex gap-2 mt-2 animate-in fade-in slide-in-from-top-1">
            <div className="w-6 shrink-0 flex justify-end">
              <IconCornerDownRight size={12} className="text-muted-foreground/50 mt-2" />
            </div>
            <CommentReplyForm
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
