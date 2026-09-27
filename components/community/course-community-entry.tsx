import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconChevronRight, IconMessages } from '@tabler/icons-react'
import { courseActivityHint, type CourseCommunityActivity } from '@/lib/community/access'

interface CourseCommunityEntryProps {
  /** The course feed. Rendered only for a viewer who can open it. */
  href: string
  /** From `loadCourseCommunityEntry`; `null` when it could not be read. */
  activity: CourseCommunityActivity | null
}

/**
 * The course page's way into its community (#868): one outlined row under the
 * course actions, never a filled element (the Continue button is the page's
 * next action). The hint says what is actually happening in the feed; an
 * unread feed gets a neutral invitation, never "No posts yet".
 */
export async function CourseCommunityEntry({ href, activity }: CourseCommunityEntryProps) {
  const t = await getTranslations('community.courseEntry')
  const hint = courseActivityHint(activity)
  const separator = <span aria-hidden="true"> · </span>

  return (
    <Link
      href={href}
      data-testid="course-community-entry"
      className="group flex min-h-14 w-full items-center gap-3 rounded-button border-2 border-border bg-input/20 px-4 py-3 transition-colors hover:bg-muted outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <IconMessages aria-hidden="true" className="size-5 shrink-0 sm:size-6" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold">{t('title')}</span>
        <span data-testid="course-community-hint" className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
          {hint.kind === 'recent' && (
            <>
              {t('recentPosts', { count: hint.count })}
              {hint.label && (
                <>
                  {separator}
                  {t('latest', { title: hint.label })}
                </>
              )}
            </>
          )}
          {hint.kind === 'latest' && t('latest', { title: hint.label })}
          {hint.kind === 'empty' && (
            <>
              {t('empty')}
              {separator}
              <span className="font-medium text-brand-text">{t('emptyCta')}</span>
            </>
          )}
          {hint.kind === 'unknown' && t('fallback')}
        </span>
      </span>
      <IconChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
