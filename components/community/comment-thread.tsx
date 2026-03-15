'use client'

import { useState, useEffect } from 'react'
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
  IconMessageCircle,
} from '@tabler/icons-react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { FlagDialog } from './flag-dialog'
import { buttonVariants } from '@/components/ui/button'
import { createComment, deleteComment, getComments } from '@/app/actions/community'

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

interface CommentThreadProps {
  postId: string
  userId: string
  tenantId: string
  isLocked: boolean
  userRole: string
}

export function CommentThread({ postId, userId, tenantId, isLocked, userRole }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [flagTarget, setFlagTarget] = useState<{ id: string; type: 'comment' } | null>(null)

  const t = useTranslations('community')
  const locale = useLocale()

  useEffect(() => {
    loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, tenantId])

  async function loadComments() {
    setLoading(true)
    try {
      const result = await getComments(postId, tenantId)
      if (!result.success || !result.data) {
        setComments([])
        return
      }

      const { comments: commentsData, profiles } = result.data
      if (commentsData.length === 0) {
        setComments([])
        return
      }

      const profilesMap = new Map(profiles.map((p: any) => [p.id, p]))

      const allComments: Comment[] = commentsData.map((c: any) => ({
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

  async function handlePost(content: string, parentId: string | null = null) {
    if (!content.trim() || isLocked) return

    setSubmitting(true)
    try {
      const result = await createComment(postId, content.trim(), parentId || undefined)
      if (!result.success) {
        toast.error(result.error || t('errorPosting'))
        return
      }

      setNewComment('')
      setReplyingTo(null)
      await loadComments()
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
      await loadComments()
      toast.success(t('postDeleted'))
    } catch {
      toast.error(t('errorPosting'))
    }
  }

  return (
    <div className="space-y-4 pt-3 border-t">
      {/* Comment form */}
      {!isLocked && (
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
              placeholder={t('writeReply')}
              className="min-h-[60px] resize-none text-xs"
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 self-end"
              onClick={() => handlePost(newComment)}
              disabled={submitting || !newComment.trim()}
            >
              <IconSend size={14} />
            </Button>
          </div>
        </div>
      )}

      {isLocked && (
        <p className="text-xs text-muted-foreground text-center py-2">{t('lockedMessage')}</p>
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
        <p className="text-xs text-muted-foreground text-center py-4">{t('noComments')}</p>
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
              submitting={submitting}
              isLocked={isLocked}
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
}: {
  onSubmit: (content: string) => void
  submitting: boolean
  t: any
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
        className="min-h-[50px] text-xs resize-none"
        autoFocus
      />
      <Button
        type="submit"
        size="icon"
        className="h-7 w-7 shrink-0 self-end"
        disabled={submitting || !content.trim()}
      >
        <IconSend size={12} />
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
  t: any
  replyingTo: string | null
  setReplyingTo: (id: string | null) => void
  onReply: (content: string, parentId: string) => void
  onDelete: (commentId: string) => void
  onFlag: (commentId: string) => void
  submitting: boolean
  isLocked: boolean
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
  submitting,
  isLocked,
}: CommentItemProps) {
  const isOwn = userId === comment.author_id
  const isReplying = replyingTo === comment.id
  const canModerate = userRole === 'admin' || userRole === 'teacher'

  return (
    <div className={cn('flex gap-2.5 group/comment', depth > 0 && 'mt-3')}>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={comment.author.avatar_url || undefined} />
        <AvatarFallback>
          <IconUser size={12} />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs">
              {comment.author.full_name || t('unknownUser')}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), {
                addSuffix: true,
                ...(locale === 'es' ? { locale: es } : {}),
              })}
            </span>
          </div>

          {(isOwn || canModerate) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                  'opacity-0 group-hover/comment:opacity-100 transition-opacity'
                )}
              >
                <IconDots size={12} />
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
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90 break-words">
          {comment.content}
        </p>

        {!isLocked && (
          <div className="flex items-center gap-3 pt-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-0 py-0.5 hover:bg-transparent text-muted-foreground hover:text-foreground text-[11px]"
              onClick={() => setReplyingTo(isReplying ? null : comment.id)}
            >
              <IconMessageCircle size={12} className="mr-1" />
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
                submitting={submitting}
                isLocked={isLocked}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
