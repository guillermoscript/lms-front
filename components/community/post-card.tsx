'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  IconBan,
  IconPhoto,
  IconLink,
  IconPencil,
} from '@tabler/icons-react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { blockUser, deletePost, updatePost } from '@/app/actions/community'
import { Textarea } from '@/components/ui/textarea'
import { ReactionBar } from './reaction-bar'
import { CommentThread } from './comment-thread'
import { ModerationToolbar } from './moderation-toolbar'
import { FlagDialog } from './flag-dialog'
import { PollCard } from './poll-card'
import { MilestoneCard } from './milestone-card'
import { DiscussionPromptCard } from './discussion-prompt-card'
import type { CommunityPost } from './community-feed'

interface PostCardProps {
  post: CommunityPost
  userId: string
  userRole: string
}

export function PostCard({ post, userId, userRole }: PostCardProps) {
  const t = useTranslations('community')
  const locale = useLocale()
  const [showComments, setShowComments] = useState(false)
  const [showFlagDialog, setShowFlagDialog] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(post.title ?? '')
  const [editContent, setEditContent] = useState(post.content)
  const [saving, setSaving] = useState(false)

  const router = useRouter()
  const isOwn = userId === post.author_id
  const canModerate = userRole === 'admin' || userRole === 'teacher'

  async function handleBlock() {
    const name = post.author.full_name || t('unknownUser')
    if (!confirm(t('blockConfirm', { name }))) return
    const result = await blockUser(post.author_id)
    if (result.success) {
      setIsDeleted(true)
      toast.success(t('blocked'))
      // Their other posts leave the feed with the next render.
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

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

  function startEditing() {
    setEditTitle(post.title ?? '')
    setEditContent(post.content)
    setIsEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const result = await updatePost(post.id, editContent, editTitle)
      if (result.success) {
        setIsEditing(false)
        toast.success(t('postUpdated'))
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error(t('errorPosting'))
    } finally {
      setSaving(false)
    }
  }

  if (isDeleted) return null

  const isPoll = post.post_type === 'poll'
  const canSave = isPoll ? editTitle.trim().length > 0 : editContent.trim().length > 0
  const authorIsStaff = post.author.role === 'teacher' || post.author.role === 'admin'

  const postTypeBadge = () => {
    switch (post.post_type) {
      case 'discussion_prompt':
        return null // DiscussionPromptCard handles its own badge
      case 'poll':
        return <Badge variant="secondary">{t('poll.badge')}</Badge>
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
                {post.author.full_name || t('unknownUser')}
              </span>
              {authorIsStaff && (
                <Badge variant="secondary" className="text-[10px]">
                  {t(post.author.role === 'admin' ? 'roleBadge.admin' : 'roleBadge.teacher')}
                </Badge>
              )}
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
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={t('postActions')} />
          }>
            <IconDots size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isOwn && (
              <>
                {post.post_type !== 'milestone' && (
                  <DropdownMenuItem onClick={startEditing}>
                    <IconPencil size={12} />
                    {t('editPost')}
                  </DropdownMenuItem>
                )}
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
            {!isOwn && !canModerate && (
              <DropdownMenuItem onClick={handleBlock}>
                <IconBan size={12} />
                {t('block')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body */}
      {isEditing ? (
        <div className="space-y-2">
          {(isPoll || post.title !== null) && (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={isPoll ? t('poll.question') : t('addTitle')}
              aria-label={isPoll ? t('poll.question') : t('addTitle')}
              maxLength={200}
              className="flex h-8 w-full rounded-md border border-input bg-input/20 px-3 text-sm font-medium outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
            />
          )}
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            aria-label={t('editPost')}
            maxLength={5000}
            className="min-h-[80px] resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !canSave}>
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      ) : post.post_type === 'discussion_prompt' ? (
        <DiscussionPromptCard post={post} />
      ) : post.post_type === 'milestone' ? (
        <MilestoneCard post={post} />
      ) : (
        <div className="space-y-2">
          {post.title && (
            <h3 className="font-bold text-sm leading-tight">{post.title}</h3>
          )}
          {post.content && (
            <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
              {post.content}
            </p>
          )}
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
