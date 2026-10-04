import { getLocale, getTranslations } from 'next-intl/server'
import { IconChevronDown } from '@tabler/icons-react'
import type { CommunityCourse } from '@/lib/community/access'

/** Links shown before the rest fold into "N more courses". */
const VISIBLE_COURSES = 6

/**
 * The school feed's way into each course feed the student can open (#868).
 * Plain links, not a filter: the school feed's filters work on the posts
 * already loaded, and a course feed is its own page with its own access gate.
 * Use document navigation: a pending school-feed Server Action can otherwise
 * replace the router tree while a course transition is in flight.
 * A long list folds into a native `<details>` — progressive disclosure with
 * no client JS. Renders nothing for an empty list.
 */
export async function CourseCommunityLinks({ courses }: { courses: CommunityCourse[] }) {
  if (courses.length === 0) return null

  const [t, locale] = await Promise.all([getTranslations('community.courseEntry'), getLocale()])
  const visible = courses.slice(0, VISIBLE_COURSES)
  const folded = courses.slice(VISIBLE_COURSES)

  const list = (items: CommunityCourse[]) => (
    <ul className="flex flex-wrap gap-2">
      {items.map((course) => (
        <li key={course.courseId} className="max-w-full">
          <a
            href={`/${locale}/dashboard/student/courses/${course.courseId}/community`}
            title={course.title}
            className="inline-flex h-10 max-w-full items-center rounded-button px-3 text-sm ring-1 ring-border transition-colors hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{course.title}</span>
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <nav aria-labelledby="course-community-links-label" data-testid="course-community-links" className="mt-3">
      <p id="course-community-links-label" className="mb-2 text-xs font-medium text-muted-foreground">
        {t('schoolLinksLabel')}
      </p>
      {list(visible)}
      {folded.length > 0 && (
        <details className="group mt-2">
          <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-button px-2 text-sm font-medium transition-colors hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <IconChevronDown
              aria-hidden="true"
              className="size-4 text-muted-foreground motion-safe:transition-transform group-open:rotate-180"
            />
            {t('moreCourses', { count: folded.length })}
          </summary>
          <div className="mt-2">{list(folded)}</div>
        </details>
      )}
    </nav>
  )
}
