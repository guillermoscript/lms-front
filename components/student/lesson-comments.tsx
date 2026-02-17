'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button, buttonVariants } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconSend, IconMessage, IconUser, IconHeart, IconDots, IconMessageCircle, IconCornerDownRight } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface CommentUser {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
}

interface CommentReaction {
  reaction_type: 'like' | 'dislike' | 'boring' | 'funny'
  user_id: string
}

interface Comment {
  id: number
  content: string
  created_at: string
  user_id: string
  parent_comment_id: number | null
  user: CommentUser
  reactions: CommentReaction[]
  replies?: Comment[]
}

interface LessonCommentsProps {
  lessonId: number
  userId: string
}

export function LessonComments({ lessonId, userId }: LessonCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<number | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('courseDetails.lessonComments')

  useEffect(() => {
    loadComments()
  }, [lessonId])

  async function loadComments() {
    setLoading(true)
    try {
      const { data: commentsData, error: commentsError } = await supabase
        .from('lesson_comments')
        .select(`
          id,
          content,
          created_at,
          user_id,
          parent_comment_id
        `)
        .eq('lesson_id', lessonId)
        .order('created_at', { ascending: true })

      if (commentsError) throw commentsError

      if (!commentsData || commentsData.length === 0) {
        setComments([])
        return
      }

      // Fetch user profiles
      const userIds = Array.from(new Set(commentsData.map(c => c.user_id)))
      const { data: usersData } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', userIds)

      const usersMap = new Map(usersData?.map(u => [u.id, u]))

      // Fetch reactions
      const commentIds = commentsData.map(c => c.id)
      const { data: reactionsData } = await supabase
        .from('comment_reactions')
        .select('comment_id, user_id, reaction_type')
        .in('comment_id', commentIds)

      // Assemble data
      const allComments: Comment[] = commentsData.map(c => {
        const user = usersMap.get(c.user_id) || {
          id: c.user_id,
          full_name: 'Unknown',
          username: null,
          avatar_url: null
        }

        const reactions = reactionsData
          ?.filter(r => r.comment_id === c.id)
          .map(r => ({ user_id: r.user_id, reaction_type: r.reaction_type as any })) || []

        return {
          ...c,
          user,
          reactions
        }
      })

      // Build tree structure
      const rootComments = allComments.filter(c => c.parent_comment_id === null)
      const replyMap = new Map<number, Comment[]>()

      allComments.forEach(c => {
        if (c.parent_comment_id) {
          const replies = replyMap.get(c.parent_comment_id) || []
          replies.push(c)
          replyMap.set(c.parent_comment_id, replies)
        }
      })

      const attachReplies = (comment: Comment): Comment => {
        const replies = replyMap.get(comment.id) || []
        // Sort replies newest first
        const sortedReplies = replies.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        return {
          ...comment,
          replies: sortedReplies.map(attachReplies)
        }
      }

      // Sort root comments newest first
      setComments(rootComments.map(attachReplies).sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ))

    } catch (error) {
      console.error('Error loading comments:', error)
      toast.error(t('errorLoading'))
    } finally {
      setLoading(false)
    }
  }

  async function handlePostComment(content: string, parentId: number | null = null) {
    if (!content.trim()) return

    setSubmitting(true)
    try {
      const { error } = await supabase.from('lesson_comments').insert({
        lesson_id: lessonId,
        user_id: userId,
        content: content.trim(),
        parent_comment_id: parentId
      })

      if (error) throw error

      if (parentId) {
        setReplyingTo(null)
      } else {
        setNewComment('')
      }

      await loadComments()
      router.refresh()
      toast.success(t('posted'))
    } catch (error) {
      console.error('Error posting comment:', error)
      toast.error(t('errorPosting'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReaction(commentId: number, type: 'like') {
    try {
      const { data: existing } = await supabase
        .from('comment_reactions')
        .select('id')
        .eq('comment_id', commentId)
        .eq('user_id', userId)
        .eq('reaction_type', type)
        .single()

      if (existing) {
        await supabase.from('comment_reactions').delete().eq('id', existing.id)
      } else {
        await supabase.from('comment_reactions').insert({
          comment_id: commentId,
          user_id: userId,
          reaction_type: type
        })
      }
      loadComments()
    } catch (error) {
      console.error('Error reacting:', error)
    }
  }

  return (
    <div className="flex flex-col h-full max-h-[800px]">
      <div className="mb-6">
        <h3 className="flex items-center gap-2 text-xl font-semibold mb-6">
          <IconMessage className="h-5 w-5" />
          {t('title', { count: comments.length })}
        </h3>

        {/* Main Comment Form */}
        <div className="flex gap-4">
          <Avatar className="h-10 w-10 mt-1 shrink-0">
            <AvatarFallback><IconUser className="h-5 w-5" /></AvatarFallback>
          </Avatar>
          <div className="flex-1 gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t('placeholder')}
              className="resize-none min-h-[100px] mb-2 shadow-sm focus-visible:ring-1"
            />
            <div className="flex justify-end">
              <Button
                onClick={() => handlePostComment(newComment)}
                disabled={submitting || !newComment.trim()}
              >
                {submitting ? t('posting') : t('post')}
                <IconSend className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 -mr-4 pr-4">
        <div className="space-y-8 pb-8">
          {loading ? (
            <div className="space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/4 rounded bg-muted" />
                    <div className="h-16 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 border rounded-lg border-dashed bg-muted/30">
              <IconMessage className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">{t('noComments')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('beFirst')}</p>
            </div>
          ) : (
            comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                userId={userId}
                t={t}
                replyingTo={replyingTo}
                setReplyingTo={setReplyingTo}
                onReply={handlePostComment}
                submitting={submitting}
                handleReaction={handleReaction}
                onDelete={async (id) => {
                  if (confirm(t('confirmDelete'))) {
                    await supabase.from('lesson_comments').delete().eq('id', id)
                    loadComments()
                  }
                }}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

interface CommentReplyFormProps {
  onSubmit: (content: string) => void
  submitting: boolean
  t: any
}

function CommentReplyForm({ onSubmit, submitting, t }: CommentReplyFormProps) {
  const [content, setContent] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    onSubmit(content)
    setContent('') // Clear on submit (though parent might unmount us)
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('writeReply')}
        className="min-h-[60px] text-sm resize-none"
        autoFocus
      />
      <Button
        type="submit"
        size="icon"
        disabled={submitting || !content.trim()}
        className="h-9 w-9 shrink-0 self-end"
      >
        <IconSend className="h-4 w-4" />
      </Button>
    </form>
  )
}

interface CommentItemProps {
  comment: Comment
  depth?: number
  userId: string
  t: any
  replyingTo: number | null
  setReplyingTo: (id: number | null) => void
  onReply: (content: string, parentId: number) => void
  submitting: boolean
  handleReaction: (commentId: number, type: 'like') => void
  onDelete: (commentId: number) => void
}

function CommentItem({
  comment,
  depth = 0,
  userId,
  t,
  replyingTo,
  setReplyingTo,
  onReply,
  submitting,
  handleReaction,
  onDelete
}: CommentItemProps) {
  const isLiked = comment.reactions.some(r => r.user_id === userId && r.reaction_type === 'like')
  const likesCount = comment.reactions.filter(r => r.reaction_type === 'like').length
  const isReplying = replyingTo === comment.id

  return (
    <div className={cn("flex gap-3 group/comment", depth > 0 && "mt-4")}>
      <Avatar className="h-8 w-8 md:h-10 md:w-10 border shrink-0">
        <AvatarImage src={comment.user.avatar_url || undefined} />
        <AvatarFallback><IconUser className="h-5 w-5" /></AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              {comment.user.full_name || comment.user.username || t('unknown')}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: es })}
            </span>
          </div>

          {userId === comment.user_id && (
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-6 w-6 focus:outline-none opacity-0 group-hover/comment:opacity-100 transition-opacity")}>
                <IconDots className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(comment.id)}
                >
                  {t('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 break-words">
          {comment.content}
        </p>

        <div className="flex items-center gap-4 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-auto px-0 py-1 hover:bg-transparent hover:text-foreground", isLiked ? "text-red-500" : "text-muted-foreground")}
            onClick={() => handleReaction(comment.id, 'like')}
          >
            <IconHeart className={cn("mr-1.5 h-3.5 w-3.5", isLiked && "fill-current")} />
            <span className="text-xs">{likesCount || t('like')}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-1 hover:bg-transparent text-muted-foreground hover:text-foreground"
            onClick={() => setReplyingTo(isReplying ? null : comment.id)}
          >
            <IconMessageCircle className="mr-1.5 h-3.5 w-3.5" />
            <span className="text-xs">{t('reply')}</span>
          </Button>
        </div>

        {isReplying && (
          <div className="flex gap-3 mt-3 animate-in fade-in slide-in-from-top-1">
            <div className="w-8 shrink-0 flex justify-end">
              <IconCornerDownRight className="h-4 w-4 text-muted-foreground/50 mt-2" />
            </div>

            <CommentReplyForm
              t={t}
              submitting={submitting}
              onSubmit={(content) => onReply(content, comment.id)}
            />
          </div>
        )}

        {/* Nested Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="pl-2 md:pl-0 space-y-4 pt-2">
            {comment.replies.map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                userId={userId}
                t={t}
                replyingTo={replyingTo}
                setReplyingTo={setReplyingTo}
                onReply={onReply}
                submitting={submitting}
                handleReaction={handleReaction}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
