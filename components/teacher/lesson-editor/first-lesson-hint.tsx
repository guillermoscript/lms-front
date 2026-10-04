import { getTranslations } from 'next-intl/server'
import { IconSparkles } from '@tabler/icons-react'

/**
 * One-line hint above the lesson editor when the user arrives straight from
 * creating a course (`?from=new-course`, #675): the course exists, and a
 * student can open nothing in it until a lesson is published.
 */
export async function FirstLessonHint({ courseTitle }: { courseTitle: string }) {
  const t = await getTranslations('dashboard.teacher.lessonEditor.firstLessonHint')
  return (
    <div
      className="border-b border-primary/20 bg-primary/5 px-4 py-2.5"
      role="status"
      data-testid="first-lesson-hint"
    >
      <p className="mx-auto flex max-w-4xl items-center gap-2 text-sm">
        <IconSparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <span className="font-medium">{t('title', { course: courseTitle })}</span>{' '}
          <span className="text-muted-foreground">{t('body')}</span>
        </span>
      </p>
    </div>
  )
}
