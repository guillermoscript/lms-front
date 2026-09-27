import { Suspense } from 'react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getLessonPrompts, type LessonPrompts } from '@/lib/community/lesson-prompts'
import { LessonDiscussionList } from './lesson-discussion-list'

interface LessonDiscussionProps {
  tenantId: string
  userId: string
  courseId: number
  lessonId: number
}

/**
 * The lesson's discussion prompts from the course community (#869).
 *
 * Streams on its own, behind the lesson: the community queries never delay
 * the material, and nothing is reserved for prompts that may not exist. The
 * page renders this only after its access gates (`requireCourseAccess`,
 * `requireRowInCourse`) — `getLessonPrompts` relies on that.
 */
export function LessonDiscussion(props: LessonDiscussionProps) {
  return (
    <Suspense fallback={null}>
      <LessonDiscussionContent {...props} />
    </Suspense>
  )
}

async function LessonDiscussionContent({ tenantId, userId, courseId, lessonId }: LessonDiscussionProps) {
  let result: LessonPrompts | 'error'
  try {
    result = await getLessonPrompts({ tenantId, viewerId: userId, courseId, lessonId })
  } catch (error) {
    console.error('Failed to load the lesson discussion:', error)
    result = 'error'
  }

  // A failure says so; it never passes for "this lesson has no prompts".
  if (result === 'error') {
    const t = await getTranslations('community.lessonDiscussion')
    return (
      <p role="status" className="border-t pt-10 text-sm text-muted-foreground">
        {t('loadError')}{' '}
        <Link
          href={`/dashboard/student/courses/${courseId}/community`}
          className="font-medium text-foreground underline underline-offset-4 hover:text-brand-text"
        >
          {t('openCommunity')}
        </Link>
      </p>
    )
  }

  // No plan, or no prompts: nothing to show (the course page carries the
  // way into the community).
  if (!result.enabled || result.prompts.length === 0) return null

  return (
    <LessonDiscussionList
      courseId={courseId}
      userId={userId}
      prompts={result.prompts}
      answeredIds={[...result.answeredIds]}
      hasMore={result.hasMore}
    />
  )
}
