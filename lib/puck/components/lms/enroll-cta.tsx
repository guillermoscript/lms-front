import { ButtonLink } from '../../utils/button-link'
import type { ComponentConfig } from '@measured/puck'
import { useLocale, useTranslations } from 'next-intl'
import { courseCheckoutHref, enrollCtaTarget } from '../../utils/checkout-href'
import { formatMoney } from '../../utils/format-money'
import { resolveCourseBinding } from './course/binding'
import { BindingNotice } from './course/course-ui'
import { useCourseNotice } from './course/use-course-notice'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../utils/section-spacing'
import { accentColorField, accentVars } from '../../utils/accent-color'
import { CoursePickerSingleField } from './course-picker-single-field'

// The href rule lives in utils/checkout-href.ts (pure, unit-tested); re-exported for callers.
export { courseCheckoutHref, enrollCtaTarget }

export type EnrollCtaProps = {
  courseId: string
  headline: string
  subtext: string
  buttonLabel: string
  accentColor: string
} & SectionSpacingProps

/**
 * A single-course call-to-action band: headline, subtext, and an enroll button targeting ONE
 * course. The `courseId` is picked (single-select) from the tenant's real published courses;
 * the render resolves it against the live metadata and links through `enrollCtaTarget`: a free
 * course to `/courses/{id}?enroll=1`, a paid one to `/checkout?courseId=` (checkout routes a
 * manual provider on). The label reflects the price. No course selected → a generic
 * "Browse courses" CTA; a selected course that is gone or a draft → nothing on the live page
 * (a notice in the editor).
 */
export const EnrollCta: ComponentConfig<EnrollCtaProps> = {
  label: 'Enroll CTA',
  fields: {
    courseId: {
      type: 'custom',
      label: 'Course',
      render: ({ value, onChange }) => (
        <CoursePickerSingleField value={value as string | undefined} onChange={onChange} />
      ),
    },
    headline: { type: 'text', label: 'Headline' },
    subtext: { type: 'textarea', label: 'Subtext' },
    buttonLabel: { type: 'text', label: 'Button Label' },
    accentColor: accentColorField,
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    courseId: '',
    headline: 'Ready to start learning?',
    subtext: 'Join today and start with the first lesson.',
    buttonLabel: '',
    accentColor: '',
  },
  render: function EnrollCtaView({ paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn, courseId, headline, subtext, buttonLabel, accentColor, puck }) {
    const t = useTranslations('puck.render')
    const tc = useTranslations('puck.courseBlocks')
    const locale = useLocale()
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }

    // Resolve the targeted course against the live metadata (beyond the latest-24 window:
    // getLandingData unions the ids the page references).
    const binding = resolveCourseBinding(puck?.metadata, courseId)
    const notice = useCourseNotice(binding)
    if (binding.state === 'missing' || binding.state === 'draft') {
      return puck?.isEditing ? <BindingNotice title={tc('blocks.EnrollCta')} message={notice} /> : <></>
    }

    const course = binding.course
    const target = enrollCtaTarget(course)
    const href = target.href
    const label =
      buttonLabel ||
      (target.label === 'browseCourses'
        ? t('browseCourses')
        : target.label === 'enrollFree'
          ? tc('enrollFree')
          : tc('enrollPaid', { price: formatMoney(course?.price, course?.currency, locale) ?? '' }))

    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing, accentVars(accentColor))}>
          <div className="rounded-card border border-border bg-[color-mix(in_srgb,var(--block-accent)_6%,var(--card))] px-6 py-12 text-center">
            {headline && (
              <h2 className="text-balance text-3xl font-semibold text-foreground lg:text-4xl">{headline}</h2>
            )}
            {subtext && <p className="mt-4 text-muted-foreground max-w-[560px] mx-auto">{subtext}</p>}
            <div className="mt-8 flex justify-center">
              <ButtonLink href={href} size="lg"
                  className="bg-[var(--block-accent)] text-[var(--block-accent-foreground)] hover:opacity-90"
                >
                  {label}
                </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    )
  },
}
