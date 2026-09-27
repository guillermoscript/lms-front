'use client'

// Learner register (DESIGN.md): 16px prose, 40px targets, hairline rows, no
// cards. Nothing here is filled — the lesson footer's next action stays the
// single filled element on the page.

import { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconCheck, IconLock } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { studentCourseFeedHref } from '@/lib/community/deep-link'
import type { LessonPrompt } from '@/lib/community/lesson-prompts'
import { CommentThread } from './comment-thread'

interface LessonDiscussionListProps {
  courseId: number
  userId: string
  prompts: LessonPrompt[]
  /** Prompts the student already answered (top-level comments only). */
  answeredIds: string[]
  /** More prompts than the lesson shows; the rest are in the course feed. */
  hasMore: boolean
}

export function LessonDiscussionList({ courseId, userId, prompts, answeredIds, hasMore }: LessonDiscussionListProps) {
  const t = useTranslations('community.lessonDiscussion')
  const headingId = useId()
  const answered = new Set(answeredIds)

  return (
    <section aria-labelledby={headingId} className="border-t pt-10" data-testid="lesson-discussion">
      <h3 id={headingId} className="text-xl font-semibold">
        {t('title')}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>

      <div className="mt-6 divide-y">
        {prompts.map((prompt) => (
          <LessonPromptItem
            key={prompt.id}
            prompt={prompt}
            courseId={courseId}
            userId={userId}
            answered={answered.has(prompt.id)}
          />
        ))}
      </div>

      {hasMore && (
        <Link
          href={`/dashboard/student/courses/${courseId}/community`}
          className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-brand-text underline-offset-4 hover:underline"
        >
          {t('more')}
        </Link>
      )}
    </section>
  )
}

/** A name for the prompt when the teacher gave it no title. */
function excerpt(text: string, max = 60) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function LessonPromptItem({
  prompt,
  courseId,
  userId,
  answered: answeredOnLoad,
}: {
  prompt: LessonPrompt
  courseId: number
  userId: string
  answered: boolean
}) {
  const t = useTranslations('community.lessonDiscussion')
  const tCommunity = useTranslations('community')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [answeredHere, setAnsweredHere] = useState(false)
  const [lastAnswerId, setLastAnswerId] = useState<string | null>(null)

  // Counted here after an answer, and taken from the server again whenever it
  // sends a new number (a delete or block re-renders the lesson).
  const [count, setCount] = useState(prompt.comment_count)
  const [serverCount, setServerCount] = useState(prompt.comment_count)
  if (prompt.comment_count !== serverCount) {
    setServerCount(prompt.comment_count)
    setCount(prompt.comment_count)
  }

  const answered = answeredOnLoad || answeredHere
  const titleId = `prompt-title-${prompt.id}`
  const name = prompt.title ?? excerpt(prompt.content)
  const feedHref = studentCourseFeedHref(courseId, prompt.id, lastAnswerId)

  function handleCreated(commentId: string, { isReply }: { isReply: boolean }) {
    // comment_count counts replies too, so the number keeps matching the feed.
    setCount((c) => c + 1)
    if (!isReply) {
      setAnsweredHere(true)
      setLastAnswerId(commentId)
    }
    const href = studentCourseFeedHref(courseId, prompt.id, commentId)
    toast.success(t('answerPosted'), {
      action: { label: t('view'), onClick: () => router.push(href) },
    })
  }

  const hasChips = prompt.is_graded || prompt.is_locked || answered

  return (
    <article id={`prompt-${prompt.id}`} aria-labelledby={titleId} className="space-y-3 py-6 first:pt-0 last:pb-0">
      {hasChips && (
        <div className="flex flex-wrap items-center gap-2">
          {prompt.is_graded && <Badge variant="secondary">{tCommunity('graded')}</Badge>}
          {prompt.is_locked && (
            <Badge variant="outline">
              <IconLock aria-hidden="true" />
              {t('closed')}
            </Badge>
          )}
          {answered && (
            <Badge variant="outline">
              <IconCheck aria-hidden="true" />
              {t('answered')}
            </Badge>
          )}
        </div>
      )}

      {prompt.title && (
        <h4 id={titleId} className="text-base font-semibold">
          {prompt.title}
        </h4>
      )}
      <p
        id={prompt.title ? undefined : titleId}
        className="max-w-prose text-base leading-relaxed whitespace-pre-wrap break-words"
      >
        {prompt.content}
      </p>
      <p className="text-sm text-muted-foreground">{t('answerCount', { count })}</p>

      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap gap-2">
          <CollapsibleTrigger render={<Button variant="outline" className="h-10 px-4 text-sm" />}>
            {open ? t('hideAnswers') : prompt.is_locked ? t('readAnswers') : t('answer')}
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            className="h-10 px-4 text-sm"
            nativeButton={false}
            render={<Link href={feedHref} />}
            // Starts with the visible text, so voice control still finds it (WCAG 2.5.3).
            aria-label={t('viewInCommunityLabel', { title: name })}
          >
            {t('viewInCommunity')}
          </Button>
        </div>
        <CollapsibleContent className="pt-4">
          <CommentThread
            postId={prompt.id}
            userId={userId}
            userRole="student"
            isLocked={prompt.is_locked}
            variant="learner"
            surface="lesson"
            autoFocusComposer
            placeholder={t('answerPlaceholder')}
            composerLabel={t('answerLabel')}
            submitLabel={t('postAnswer')}
            emptyText={t('answerCount', { count: 0 })}
            onCommentCreated={handleCreated}
          />
        </CollapsibleContent>
      </Collapsible>
    </article>
  )
}
