'use client'

import Link from 'next/link'
import { IconBulb, IconChecklist, IconMessageCircle } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { ViewerPromptGrade } from '@/lib/community/prompt-grades'
import { CommunityMarkdown } from './community-markdown'
import { PromptDueBadge, PromptGradeResult } from './prompt-grade'

interface CommunityPost {
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
  due_at?: string | null
  viewer_grade?: ViewerPromptGrade | null
  milestone_type: string | null
  milestone_data: unknown
  author: { id: string; full_name: string | null; avatar_url: string | null }
  user_reactions: string[]
  poll_options?: { id: string; option_text: string; vote_count: number; sort_order: number }[]
  user_voted_option?: string | null
}

interface DiscussionPromptCardProps {
  post: CommunityPost
  /** Staff see a way into the grading view of a graded course prompt (#873). */
  canGrade?: boolean
}

export function DiscussionPromptCard({ post, canGrade = false }: DiscussionPromptCardProps) {
  const t = useTranslations('community')
  const gradingHref =
    canGrade && post.is_graded && post.course_id
      ? `/dashboard/teacher/courses/${post.course_id}/community/prompts/${post.id}`
      : null

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
        {post.is_graded && <PromptDueBadge dueAt={post.due_at} className="text-[10px]" />}
      </div>
      {post.title && (
        <h3 className="font-bold text-sm leading-tight">{post.title}</h3>
      )}
      <CommunityMarkdown content={post.content} className="text-sm" collapsible />
      {post.is_graded && post.viewer_grade && <PromptGradeResult grade={post.viewer_grade} />}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <IconMessageCircle size={14} />
          <span>
            {t('comments', { count: post.comment_count })}
          </span>
        </div>
        {gradingHref && (
          <Link
            href={gradingHref}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            aria-label={t('grading.gradeAnswersLabel', { title: post.title ?? t('discussionPrompt') })}
            data-testid="prompt-grade-link"
          >
            <IconChecklist className="size-3.5" aria-hidden="true" />
            {t('grading.gradeAnswers')}
          </Link>
        )}
      </div>
    </div>
  )
}
