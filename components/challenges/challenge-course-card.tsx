import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { IconArrowRight, IconBook2, IconClock } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { CourseCover } from '@/components/public/course-cover'
import { formatCurrency } from '@/lib/currency'
import type { ChallengeCourse } from '@/lib/challenges/course-context'

/**
 * Course the challenge exercise comes from. `context` sits above the exercise
 * ("this exercise is part of…"); `upsell` sits under the AI feedback ("improve
 * with this course"). The CTA only links to the course page, which owns
 * enrollment and checkout: this card never grants access.
 */
export function ChallengeCourseCard({ course, variant }: { course: ChallengeCourse; variant: 'context' | 'upsell' }) {
  const t = useTranslations('challenges.course')
  const locale = useLocale()
  const href = `/courses/${course.id}`
  const upsell = variant === 'upsell'
  const price = course.isFree ? t('free') : course.price != null ? formatCurrency(course.price, course.currency, locale) : null
  const cta = upsell ? (course.isFree ? t('ctaUpsellFree') : t('ctaUpsellPaid')) : course.isFree ? t('ctaFree') : t('ctaPaid')
  const headingId = `challenge-course-${variant}`

  return (
    <section
      aria-labelledby={headingId}
      data-testid={`challenge-course-${variant}`}
      className="overflow-hidden rounded-xl border border-border bg-card sm:flex"
    >
      <div className="sm:w-56 sm:shrink-0">
        <CourseCover title={course.title} thumbnailUrl={course.thumbnailUrl} className="sm:h-full sm:aspect-auto" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {upsell ? t('upsellEyebrow') : t('contextEyebrow')}
          </p>
          <h2 id={headingId} className="text-balance text-lg font-semibold leading-snug">
            {upsell ? t('upsellTitle', { course: course.title }) : course.title}
          </h2>
          {course.description ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{course.description}</p>
          ) : null}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {course.lessonCount > 0 ? (
            <li className="inline-flex items-center gap-1.5">
              <IconBook2 className="size-4" aria-hidden />
              {t('lessons', { count: course.lessonCount })}
            </li>
          ) : null}
          {course.durationMinutes ? (
            <li className="inline-flex items-center gap-1.5">
              <IconClock className="size-4" aria-hidden />
              {t('duration', { minutes: course.durationMinutes })}
            </li>
          ) : null}
          {price ? <li className="font-medium text-foreground">{price}</li> : null}
        </ul>
        <div>
          <Button render={<Link href={href} />} variant={upsell ? 'default' : 'outline'} className="w-full sm:w-auto">
            {cta}
            <IconArrowRight aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  )
}
