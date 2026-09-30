'use client'

// Learner register (DESIGN.md): 16px prose, 40px targets, hairline rows, no
// cards. Nothing here is filled — the lesson footer's next action stays the
// single filled element on the page.

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconCheck, IconLock } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { studentCourseFeedHref } from '@/lib/community/deep-link'
import { cn } from '@/lib/utils'
import {
  answerStateFromThread,
  createAnswerMemory,
  withPostedAnswer,
  type AnswerState,
} from '@/lib/community/lesson-answers'
import type { LessonPrompt } from '@/lib/community/lesson-prompts'
import { CommentThread } from './comment-thread'
import { CommunityMarkdown } from './community-markdown'
import { PromptDueBadge, PromptGradeResult } from './prompt-grade'

// Outlives a remount, so browser Back (served from the lesson's cached
// payload) still shows answers posted here. Written only from an effect,
// which runs in the browser: on the server it stays empty.
const answerMemory = createAnswerMemory()

interface LessonDiscussionListProps {
  courseId: number
  userId: string
  prompts: LessonPrompt[]
  /** Prompts the student already answered (top-level comments only). */
  answeredIds: string[]
  /** More prompts than the lesson shows; the rest are in the course feed. */
  hasMore: boolean
  /** Identifies the server read these props came from. */
  loadId: string
}

export function LessonDiscussionList({
  courseId,
  userId,
  prompts,
  answeredIds,
  hasMore,
  loadId,
}: LessonDiscussionListProps) {
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
            loadId={loadId}
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
  loadId,
}: {
  prompt: LessonPrompt
  courseId: number
  userId: string
  answered: boolean
  loadId: string
}) {
  const t = useTranslations('community.lessonDiscussion')
  const tCommunity = useTranslations('community')
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // The server's numbers, until the thread loads and knows better. A newer
  // server read (a delete or block re-renders the lesson) wins again.
  const fromServer: AnswerState = { count: prompt.answer_count, answered: answeredOnLoad, lastAnswerId: null }
  const [answers, setAnswers] = useState<AnswerState>(() => answerMemory.recall(prompt.id, loadId) ?? fromServer)
  const [shownLoadId, setShownLoadId] = useState(loadId)
  if (loadId !== shownLoadId) {
    setShownLoadId(loadId)
    setAnswers(fromServer)
  }

  useEffect(() => {
    answerMemory.remember(prompt.id, loadId, answers)
  }, [prompt.id, loadId, answers])

  const { count, answered, lastAnswerId } = answers
  const titleId = `prompt-title-${prompt.id}`
  const name = prompt.title ?? excerpt(prompt.content)
  // Locale-prefixed: a locale-less path is redirected by proxy.ts, and the
  // client router drops the `#comment-` anchor on that redirect.
  const locale = useLocale()
  const feedHref = `/${locale}${studentCourseFeedHref(courseId, prompt.id, lastAnswerId)}`

  function handleCreated(commentId: string, { isReply }: { isReply: boolean }) {
    // Functional: the thread's reload has just updated `answers`.
    if (!isReply) setAnswers((current) => withPostedAnswer(current, commentId))
    const href = `/${locale}${studentCourseFeedHref(courseId, prompt.id, commentId)}`
    toast.success(isReply ? tCommunity('replyPosted') : t('answerPosted'), {
      action: { label: t('view'), onClick: () => router.push(href) },
    })
  }

  const hasChips = prompt.is_graded || prompt.is_locked || answered
  const tGrade = useTranslations('community.promptGrade')

  return (
    <article id={`prompt-${prompt.id}`} aria-labelledby={titleId} className="space-y-3 py-6 first:pt-0 last:pb-0">
      {hasChips && (
        <div className="flex flex-wrap items-center gap-2">
          {prompt.is_graded && <Badge variant="secondary">{tCommunity('graded')}</Badge>}
          {prompt.is_graded && <PromptDueBadge dueAt={prompt.due_at} />}
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
      <CommunityMarkdown
        id={prompt.title ? undefined : titleId}
        content={prompt.content}
        className="max-w-prose text-base"
      />
      <p className="text-sm text-muted-foreground">{t('answerCount', { count })}</p>

      {/* #873: the student's own grade, or that it is still to come. */}
      {prompt.is_graded && prompt.viewer_grade && <PromptGradeResult grade={prompt.viewer_grade} className="max-w-prose" />}
      {prompt.is_graded && !prompt.viewer_grade && answered && (
        <p className="text-sm text-muted-foreground" data-testid="prompt-grade-pending">
          {tGrade('pending')}
        </p>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap gap-2">
          <CollapsibleTrigger render={<Button variant="outline" className="h-10 px-4 text-sm" />}>
            {open ? t('hideAnswers') : prompt.is_locked ? t('readAnswers') : t('answer')}
          </CollapsibleTrigger>
          {/* A real link styled as a button: `<Button nativeButton={false}>` would
              announce navigation as a button. */}
          <Link
            href={feedHref}
            className={cn(buttonVariants({ variant: 'ghost' }), 'h-10 px-4 text-sm')}
            // Starts with the visible text, so voice control still finds it (WCAG 2.5.3).
            aria-label={t('viewInCommunityLabel', { title: name })}
          >
            {t('viewInCommunity')}
          </Link>
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
            emptyText={prompt.is_locked ? t('answerCount', { count: 0 }) : t('beFirstAnswer')}
            onCommentCreated={handleCreated}
            onCommentsLoaded={(roots) => setAnswers(answerStateFromThread(roots, userId))}
          />
        </CollapsibleContent>
      </Collapsible>
    </article>
  )
}
