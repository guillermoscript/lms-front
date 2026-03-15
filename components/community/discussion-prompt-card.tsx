'use client'

import { IconBulb, IconMessageCircle } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'

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

interface DiscussionPromptCardProps {
  post: CommunityPost
}

export function DiscussionPromptCard({ post }: DiscussionPromptCardProps) {
  const t = useTranslations('community')

  return (
    <div className="border-l-4 border-primary pl-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="gap-1">
          <IconBulb size={10} />
          {t('discussionPrompt')}
        </Badge>
        {post.lesson_id && (
          <Badge variant="outline" className="text-[10px]">
            {t('linkedToLesson')}
          </Badge>
        )}
        {post.is_graded && (
          <Badge variant="default" className="text-[10px]">
            {t('graded')}
          </Badge>
        )}
      </div>
      {post.title && (
        <h3 className="font-bold text-sm leading-tight">{post.title}</h3>
      )}
      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{post.content}</p>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
        <IconMessageCircle size={14} />
        <span>
          {t('comments', { count: post.comment_count })}
        </span>
      </div>
    </div>
  )
}
