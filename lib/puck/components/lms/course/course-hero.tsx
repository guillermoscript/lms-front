import type { ComponentConfig } from '@measured/puck'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { ButtonLink } from '../../../utils/button-link'
import { courseCheckoutHref, isFreePrice } from '../../../utils/checkout-href'
import { formatMoney } from '../../../utils/format-money'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../../utils/section-spacing'
import { CoursePickerSingleField } from '../course-picker-single-field'
import { resolveCourseBinding } from './binding'
import { AuthorAvatar, BindingNotice, Stars } from './course-ui'
import { useCourseNotice } from './use-course-notice'

export type CourseHeroProps = {
  courseId: string
  variant: 'split' | 'centered'
  eyebrow: string
  titleOverride: string
  subtitleOverride: string
  showPrice: boolean
  showStats: boolean
  ctaLabel: string
} & SectionSpacingProps

const yesNo = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
]

/**
 * The hero of a course page, bound to ONE real course: title, description,
 * cover, price, lesson count, rating and instructor all come from the course.
 * Copy fields (eyebrow, overrides, CTA label) are the only free text.
 */
export const CourseHero: ComponentConfig<CourseHeroProps> = {
  label: 'Course Hero',
  fields: {
    courseId: {
      type: 'custom',
      label: 'Course',
      render: ({ value, onChange }) => <CoursePickerSingleField value={value as string | undefined} onChange={onChange} />,
    },
    variant: {
      type: 'radio',
      label: 'Variant',
      options: [
        { label: 'Split', value: 'split' },
        { label: 'Centered', value: 'centered' },
      ],
    },
    eyebrow: { type: 'text', label: 'Eyebrow' },
    titleOverride: { type: 'text', label: 'Title Override' },
    subtitleOverride: { type: 'textarea', label: 'Subtitle Override' },
    showPrice: { type: 'radio', label: 'Show Price', options: yesNo },
    showStats: { type: 'radio', label: 'Show Stats', options: yesNo },
    ctaLabel: { type: 'text', label: 'Button Label' },
    ...sectionSpacingFields,
  },
  defaultProps: {
    courseId: '',
    variant: 'split',
    eyebrow: '',
    titleOverride: '',
    subtitleOverride: '',
    showPrice: true,
    showStats: true,
    ctaLabel: '',
    ...sectionSpacingDefaults,
  },
  render: function CourseHeroView(props) {
    const { courseId, variant, eyebrow, titleOverride, subtitleOverride, showPrice, showStats, ctaLabel, puck } = props
    const t = useTranslations('puck.courseBlocks')
    const locale = useLocale()
    const binding = resolveCourseBinding(puck?.metadata, courseId)
    const notice = useCourseNotice(binding)

    if (binding.state !== 'ready' || !binding.course) {
      return puck?.isEditing ? <BindingNotice title={t('blocks.CourseHero')} message={notice} /> : <></>
    }

    const course = binding.course
    const details = binding.details
    const title = titleOverride.trim() || course.title
    const subtitle = subtitleOverride.trim() || course.description || ''
    const price = formatMoney(course.price, course.currency, locale)
    const free = isFreePrice(course.price)
    const label = ctaLabel.trim() || (free ? t('enrollFree') : t('enrollPaid', { price: price ?? '' }))
    const href = courseCheckoutHref(course)
    const centered = variant === 'centered'

    const stats: React.ReactNode[] = []
    if (showStats && details) {
      if (details.lessonCount > 0) stats.push(<span key="l">{t('lessons', { count: details.lessonCount })}</span>)
      if (details.rating.avg != null && details.rating.count > 0) {
        stats.push(
          <span key="r" className="inline-flex items-center gap-1.5">
            <Stars rating={details.rating.avg} label={t('ratingSr', { rating: details.rating.avg })} />
            <span aria-hidden="true">{t('rating', { rating: details.rating.avg, count: details.rating.count })}</span>
          </span>
        )
      }
    }
    const author = showStats && details?.author?.name ? details.author : null

    const text = (
      <div className={cn('flex flex-col gap-5', centered ? 'items-center text-center' : 'items-start text-left')}>
        {eyebrow && (
          <p className="text-sm font-medium uppercase tracking-wide text-[var(--brand-text,var(--primary))]">{eyebrow}</p>
        )}
        <h1 className="text-balance text-4xl font-semibold leading-tight text-foreground lg:text-5xl">{title}</h1>
        {subtitle && (
          <p className={cn('text-pretty text-lg leading-relaxed text-muted-foreground', centered ? 'max-w-2xl' : 'max-w-xl')}>
            {subtitle}
          </p>
        )}
        {(stats.length > 0 || author) && (
          <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground', centered && 'justify-center')}>
            {author && (
              <span className="inline-flex items-center gap-2">
                <AuthorAvatar name={author.name ?? ''} src={author.avatar} />
                <span>{t('byAuthor', { name: author.name ?? '' })}</span>
              </span>
            )}
            {stats}
          </div>
        )}
        <div className={cn('mt-2 flex flex-wrap items-center gap-4', centered && 'justify-center')}>
          <ButtonLink href={href} size="lg">{label}</ButtonLink>
          {showPrice && (
            <span className="text-lg font-semibold text-foreground">{free ? t('free') : price}</span>
          )}
        </div>
      </div>
    )

    const image = course.image ? (
      <div className={cn('overflow-hidden rounded-card border border-border bg-muted', centered && 'mx-auto w-full max-w-3xl')}>
        <img src={course.image} alt="" className="aspect-video w-full object-cover" />
      </div>
    ) : null

    return (
      <div {...sectionOuterProps(props)}>
        <div {...sectionInnerProps(props)}>
          {centered ? (
            <div className="flex flex-col gap-10">
              {text}
              {image}
            </div>
          ) : (
            <div className={cn('grid items-center gap-10', image && 'lg:grid-cols-2')}>
              {text}
              {image}
            </div>
          )}
        </div>
      </div>
    )
  },
}
