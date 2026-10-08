import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { LandingCourse, PuckMetadata } from '../../types'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterProps, sectionInnerProps } from '../../utils/section-spacing'
import { CoursePickerField } from './course-picker-field'
import { BindingNotice } from './course/course-ui'

export type CourseGridProps = {
  title: string
  subtitle: string
  courseIds: { id: string }[]
  /** Show ONLY the picked courses: nothing (publicly) when none resolve, never the latest. */
  curatedOnly?: boolean
  maxItems: number
  columns: '2' | '3' | '4'
  showPrice: boolean
  showDescription: boolean
} & SectionSpacingProps

const columnClasses: Record<string, string> = {
  '2': 'grid-cols-1 md:grid-cols-2',
  '3': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  '4': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
}

export const CourseGrid: ComponentConfig<CourseGridProps> = {
  label: 'Course Grid',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    courseIds: {
      type: 'custom',
      label: 'Curated Courses (leave empty for latest)',
      render: ({ value, onChange }) => (
        <CoursePickerField value={value as { id: string }[] | undefined} onChange={onChange} />
      ),
    },
    curatedOnly: {
      type: 'radio',
      label: 'Only the picked courses',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    maxItems: { type: 'number', label: 'Max Courses', min: 1, max: 24 },
    columns: {
      type: 'select',
      label: 'Columns',
      options: [
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
      ],
    },
    showPrice: {
      type: 'radio',
      label: 'Show Price',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    showDescription: {
      type: 'radio',
      label: 'Show Description',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    title: 'Our Courses',
    subtitle: 'Explore our catalog and start learning today.',
    courseIds: [],
    curatedOnly: false,
    maxItems: 6,
    columns: '3',
    showPrice: true,
    showDescription: true,
    ...sectionSpacingDefaults,
  },
  render: function CourseGridView({ title, subtitle, courseIds, curatedOnly, maxItems, columns, showPrice, showDescription, paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn, puck }) {
    const t = useTranslations('puck.render')
    const tc = useTranslations('puck.courseBlocks')
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }
    if (maxItems <= 0) return <></>

    // Real catalog resolved server-side and handed in via metadata. When present
    // (published pages, preview, editor with data) we render the school's actual
    // published courses; otherwise we fall back to placeholders so the canvas is
    // never empty (e.g. a brand-new school with no courses yet).
    const liveCourses = ((puck?.metadata as PuckMetadata | undefined)?.courses ?? []) as LandingCourse[]
    const usingLive = liveCourses.length > 0

    // Curation: when the admin has pinned specific course IDs, show exactly those
    // (in the given order); otherwise show the latest published courses. Curated IDs
    // that no longer resolve (unpublished/deleted) are skipped. If curation is set
    // but matches nothing, fall back to the latest so the section is never empty —
    // unless `curatedOnly` (a bundle's "courses in this bundle"): then the section
    // hides publicly rather than list unrelated courses.
    const curatedIds = (courseIds ?? []).map((c) => c?.id).filter((id): id is string => !!id)
    const byId = new Map(liveCourses.map((c) => [c.id, c]))
    const curated = curatedIds.map((id) => byId.get(id)).filter((c): c is LandingCourse => !!c)
    if (curatedOnly && curated.length === 0) {
      return puck?.isEditing ? <BindingNotice title={tc('blocks.CourseGrid')} message={tc('notice.noCuratedCourses')} /> : <></>
    }
    const sourceCourses = curated.length > 0 ? curated : liveCourses

    const items = usingLive
      ? sourceCourses.slice(0, maxItems).map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description ?? '',
          price: c.price,
          currency: c.currency,
          image: c.image || `https://placehold.co/400x225/e2e8f0/64748b?text=${encodeURIComponent(c.title)}`,
          href: `/courses/${c.id}`,
        }))
      : Array.from({ length: Math.min(maxItems, 6) }, (_, i) => ({
          id: `placeholder-${i}`,
          title: t('course', { number: i + 1 }),
          description: t('courseDescription'),
          price: (i + 1) * 29,
          currency: 'USD' as string | null,
          image: `https://placehold.co/400x225/e2e8f0/64748b?text=Course+${i + 1}`,
          href: undefined as string | undefined,
        }))

    const formatPrice = (price: number, currency: string | null) => {
      try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'USD').toUpperCase() }).format(price)
      } catch {
        return `$${price}`
      }
    }

    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing)}>
          <div>
            {title && (
              <h2 className="text-3xl font-bold text-center text-foreground mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-center text-muted-foreground max-w-[640px] mx-auto mb-10 leading-relaxed">
                {subtitle}
              </p>
            )}
            <div className={cn('grid gap-6', columnClasses[columns])}>
              {items.map((course) => {
                const Card = course.href ? 'a' : 'div'
                return (
                  <Card
                    key={course.id}
                    {...(course.href ? { href: course.href } : {})}
                    className="group block rounded-card overflow-hidden border border-border bg-card transition-colors motion-reduce:transition-none duration-300  "
                  >
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={course.image}
                        alt={course.title}
                        className="w-full h-full object-cover transition-transform motion-reduce:transition-none duration-500"
                      />
                    </div>
                    <div className="p-5">
                      <h3 className="font-semibold text-base text-foreground mb-2 truncate">{course.title}</h3>
                      {showDescription && course.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-2">
                          {course.description}
                        </p>
                      )}
                      {showPrice && course.price != null && (
                        <p className="font-bold text-lg text-primary">
                          {formatPrice(course.price, course.currency)}
                        </p>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
