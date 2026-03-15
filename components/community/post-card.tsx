'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  IconUser,
  IconDots,
  IconMessageCircle,
  IconPin,
  IconLock,
  IconFlag,
  IconPhoto,
  IconLink,
} from '@tabler/icons-react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { deletePost } from '@/app/actions/community'
import { ReactionBar } from './reaction-bar'
import { CommentThread } from './comment-thread'
import { ModerationToolbar } from './moderation-toolbar'
import { FlagDialog } from './flag-dialog'
import { PollCard } from './poll-card'
import { MilestoneCard } from './milestone-card'
import { DiscussionPromptCard } from './discussion-prompt-card'

interface CommunityPost {
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

interface PostCardProps {
  post: CommunityPost
  userId: string
  userRole: string
  tenantId: string
}

export function PostCard({ post, userId, userRole, tenantId }: PostCardProps) {
  const t = useTranslations('community')
  const locale = useLocale()
  const [showComments, setShowComments] = useState(false)
  const [showFlagDialog, setShowFlagDialog] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)

  const isOwn = userId === post.author_id
  const canModerate = userRole === 'admin' || userRole === 'teacher'

  async function handleDelete() {
    if (!confirm(t('confirmDelete'))) return
    try {
      const result = await deletePost(post.id)
      if (result.success) {
        setIsDeleted(true)
        toast.success(t('postDeleted'))
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error(t('errorPosting'))
    }
  }

  if (isDeleted) return null

  const postTypeBadge = () => {
    switch (post.post_type) {
      case 'discussion_prompt':
        return null // DiscussionPromptCard handles its own badge
      case 'poll':
        return <Badge variant="secondary">{t('poll.title')}</Badge>
      case 'milestone':
        return null // MilestoneCard handles its own display
      default:
        return null
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 transition-colors hover:bg-card/80">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-10 w-10 shrink-0 border">
            <AvatarImage src={post.author.avatar_url || undefined} />
            <AvatarFallback>
              <IconUser size={16} />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">
                {post.author.full_name || 'User'}
              </span>
              {post.is_pinned && (
                <Badge variant="outline" className="gap-0.5 text-[10px]">
                  <IconPin size={8} />
                  {t('pinned')}
                </Badge>
              )}
              {post.is_locked && (
                <IconLock size={12} className="text-muted-foreground" />
              )}
              {postTypeBadge()}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(post.created_at), {
                addSuffix: true,
                ...(locale === 'es' ? { locale: es } : {}),
              })}
            </span>
          </div>
        </div>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" />
          }>
            <IconDots size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isOwn && (
              <>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDelete}
                >
                  {t('deletePost')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {!isOwn && (
              <DropdownMenuItem onClick={() => setShowFlagDialog(true)}>
                <IconFlag size={12} />
                {t('flag')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body */}
      {post.post_type === 'discussion_prompt' ? (
        <DiscussionPromptCard post={post} />
      ) : post.post_type === 'milestone' ? (
        <MilestoneCard post={post} />
      ) : (
        <div className="space-y-2">
          {post.title && (
            <h3 className="font-bold text-sm leading-tight">{post.title}</h3>
          )}
          <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
            {post.content}
          </p>
        </div>
      )}

      {/* Poll */}
      {post.post_type === 'poll' && post.poll_options && (
        <PollCard post={post} userId={userId} />
      )}

      {/* Media gallery */}
      {post.media_urls && post.media_urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.media_urls.map((media, i) => {
            // Only render URLs with safe schemes (prevent javascript:, data: XSS)
            const isSafeUrl = /^https?:\/\//i.test(media.url)
            if (!isSafeUrl) return null

            if (media.type === 'image') {
              return (
                <a
                  key={i}
                  href={media.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg overflow-hidden border"
                >
                  <img
                    src={media.url}
                    alt={media.name}
                    className="max-h-60 object-cover"
                  />
                </a>
              )
            }
            if (media.type === 'video') {
              return (
                <video
                  key={i}
                  src={media.url}
                  controls
                  className="max-h-60 rounded-lg border"
                />
              )
            }
            return (
              <a
                key={i}
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
              >
                <IconLink size={12} />
                {media.name}
              </a>
            )
          })}
        </div>
      )}

      {/* Reactions + comments toggle */}
      <div className="flex items-center justify-between" data-tour="community-reactions">
        <ReactionBar
          postId={post.id}
          userId={userId}
          currentReactions={post.user_reactions}
          reactionCount={post.reaction_count}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground"
          onClick={() => setShowComments((prev) => !prev)}
        >
          <IconMessageCircle size={14} />
          {post.comment_count > 0 ? t('comments', { count: post.comment_count }) : t('showComments')}
        </Button>
      </div>

      {/* Moderation toolbar */}
      {canModerate && (
        <ModerationToolbar
          postId={post.id}
          isPinned={post.is_pinned}
          isLocked={post.is_locked}
        />
      )}

      {/* Comment thread */}
      {showComments && (
        <CommentThread
          postId={post.id}
          userId={userId}
          tenantId={tenantId}
          isLocked={post.is_locked}
          userRole={userRole}
        />
      )}

      {/* Flag dialog */}
      <FlagDialog
        targetType="post"
        targetId={post.id}
        open={showFlagDialog}
        onOpenChange={setShowFlagDialog}
      />
    </div>
  )
}
