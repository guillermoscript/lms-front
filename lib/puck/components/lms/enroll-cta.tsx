import type { ComponentConfig } from '@measured/puck'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { LandingCourse, PuckMetadata } from '../../types'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterClass,
  sectionInnerClass,
} from '../../utils/section-spacing'
import { accentColorField, accentVars } from '../../utils/accent-color'
import { CoursePickerSingleField } from './course-picker-single-field'

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
 * the render resolves it against the live catalog (metadata.courses) and links to the
 * free-enroll deep link `/courses/{id}?enroll=1`. When no course is selected or it no longer
 * resolves, the band degrades to a generic "Browse courses" CTA linking to /courses.
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
    subtext: 'Enroll now and get instant access — no cost, no credit card required.',
    buttonLabel: '',
    accentColor: '',
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, courseId, headline, subtext, buttonLabel, accentColor, puck }) => {
    const t = useTranslations('puck.render')
    const spacing = { paddingY, paddingX, maxWidth, marginY }

    // Resolve the targeted course against the live catalog. When it resolves, the button
    // deep-links to the free-enroll flow; otherwise fall back to a generic catalog CTA.
    const courses = ((puck?.metadata as PuckMetadata | undefined)?.courses ?? []) as LandingCourse[]
    const course = courseId ? courses.find((c) => c.id === courseId) : undefined

    const href = course ? `/courses/${course.id}?enroll=1` : '/courses'
    const label = buttonLabel || (course ? t('enroll') : t('browseCourses'))

    return (
      <div className={sectionOuterClass(spacing)} style={accentVars(accentColor)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="rounded-2xl border border-border bg-[color-mix(in_srgb,var(--block-accent)_6%,var(--card))] px-6 py-12 text-center">
            {headline && (
              <h2 className="text-balance text-3xl font-semibold text-foreground lg:text-4xl">{headline}</h2>
            )}
            {subtext && <p className="mt-4 text-muted-foreground max-w-[560px] mx-auto">{subtext}</p>}
            <div className="mt-8 flex justify-center">
              <Link href={href}>
                <Button size="lg" className="bg-[var(--block-accent)] text-white hover:opacity-90">
                  {label}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  },
}
