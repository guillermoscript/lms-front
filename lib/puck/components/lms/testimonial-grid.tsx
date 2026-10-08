import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { LandingTestimonial, PuckMetadata } from '../../types'
import { CoursePickerSingleField } from './course-picker-single-field'
import { resolveCourseBinding } from './course/binding'
import { BindingNotice } from './course/course-ui'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterProps, sectionInnerProps } from '../../utils/section-spacing'

type TestimonialItem = {
  name: string
  role: string
  quote: string
  rating: number
}

export type TestimonialGridProps = {
  title: string
  subtitle: string
  // 'live' = real course reviews only (hidden publicly when there are none);
  // 'manual' = the written `items`. Unset (pages saved before the field existed)
  // keeps the old behaviour: live reviews when any, else the items.
  source?: 'live' | 'manual'
  courseId?: string
  minRating?: number
  limit?: number
  items: TestimonialItem[]
} & SectionSpacingProps

/**
 * Pick the reviews a live TestimonialGrid shows: one course's reviews when
 * `courseId` is bound (from courseDetails), else the school's recent reviews;
 * at least `minRating` stars; at most `limit`.
 */
export function selectLiveTestimonials(
  metadata: unknown,
  opts: { courseId?: string; minRating?: number; limit?: number }
): LandingTestimonial[] {
  const meta = (metadata ?? {}) as PuckMetadata
  const binding = resolveCourseBinding(meta, opts.courseId)
  const pool =
    binding.state === 'unbound' ? (meta.testimonials ?? []) : binding.state === 'ready' ? (binding.details?.reviews ?? []) : []
  const min = Math.min(5, Math.max(1, Number(opts.minRating) || 1))
  const limit = Math.min(12, Math.max(1, Math.floor(Number(opts.limit) || 6)))
  return pool.filter((r) => (r.rating ?? 0) >= min && r.quote.trim()).slice(0, limit)
}

export const TestimonialGrid: ComponentConfig<TestimonialGridProps> = {
  label: 'Testimonials',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    source: {
      type: 'radio',
      label: 'Source',
      options: [
        { label: 'Live reviews', value: 'live' },
        { label: 'Manual quotes', value: 'manual' },
      ],
    },
    courseId: {
      type: 'custom',
      label: 'Course',
      render: ({ value, onChange }) => (
        <CoursePickerSingleField value={value as string | undefined} onChange={onChange} />
      ),
    },
    minRating: { type: 'number', label: 'Minimum Rating', min: 1, max: 5 },
    limit: { type: 'number', label: 'Max Reviews', min: 1, max: 12 },
    items: {
      type: 'array',
      label: 'Testimonials',
      arrayFields: {
        name: { type: 'text', label: 'Name' },
        role: { type: 'text', label: 'Role' },
        quote: { type: 'textarea', label: 'Quote' },
        rating: { type: 'number', label: 'Rating (1-5)', min: 1, max: 5 },
      },
      defaultItemProps: { name: 'Student name', role: 'Course they took', quote: 'Their words about what changed.', rating: 5 },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    title: 'What Our Students Say',
    subtitle: '',
    source: 'live',
    courseId: '',
    minRating: 4,
    limit: 6,
    // Placeholders, never invented people (#739, the same rule the stats blocks
    // follow since #724). These cards are what a school publishes if it drops the
    // block on a page and never edits it, and real course reviews (below) replace
    // them the moment there are any — so a named "Maria S., Web Developer" saying
    // she went from beginner to professional in three months was a fabricated
    // student making a fabricated claim on that school's own site. The copy still
    // demonstrates what the block is for, and reads as a prompt to the editor.
    items: [
      { name: 'Student name', role: 'Course they took', quote: 'Replace with a real quote from one of your students: what they could not do before, and what they can do now.', rating: 5 },
      { name: 'Student name', role: 'Course they took', quote: 'A second quote. One or two sentences from the student, in their own words, beat a polished paragraph.', rating: 5 },
      { name: 'Student name', role: 'Course they took', quote: 'A third quote. Ask for something specific, the result rather than the compliment.', rating: 5 },
    ],
    ...sectionSpacingDefaults,
  },
  render: function TestimonialGridView({ title, subtitle, source, courseId, minRating, limit, items, paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn, puck }) {
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }
    const tc = useTranslations('puck.courseBlocks')

    // Real course reviews resolved server-side and handed in via metadata — never invented
    // people. 'live' shows only those (nothing publicly when there are none yet); 'manual'
    // shows the written quotes; an unset source keeps the old live-else-items behaviour.
    const binding = resolveCourseBinding(puck?.metadata, courseId)
    const live = selectLiveTestimonials(puck?.metadata, { courseId, minRating, limit }).map((tm) => ({
      name: tm.name || tc('anonymousStudent'),
      role: tm.courseTitle ?? '',
      quote: tm.quote,
      rating: tm.rating ?? 5,
    }))
    const mode = source ?? (live.length > 0 ? 'live' : 'manual')
    const resolvedItems: TestimonialItem[] = mode === 'live' ? live : (items ?? [])

    if (!resolvedItems.length) {
      if (!puck?.isEditing) return <></>
      const message =
        binding.state === 'missing' || binding.state === 'draft' ? tc('notice.missingCourse') : tc('notice.noReviews')
      return <BindingNotice title={tc('blocks.TestimonialGrid')} message={message} />
    }

    const gridCols = resolvedItems.length <= 2
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'

    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing)}>
          <div>
            {title && (
              <h2 className="text-3xl font-bold text-center text-foreground mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-center text-muted-foreground mb-10">{subtitle}</p>
            )}
            {puck?.isEditing && mode === 'manual' && (
              <p role="note" className="mb-6 text-center text-xs text-muted-foreground">{tc('notice.manualQuotes')}</p>
            )}
            <div className={cn('grid gap-6', gridCols)}>
              {resolvedItems.map((item, i) => (
                <div
                  key={i}
                  className="p-6 rounded-card border border-border bg-card transition-colors motion-reduce:transition-none duration-300  "
                >
                  <div className="flex gap-1 mb-4">
                    <span aria-hidden="true" className="flex gap-1">
                      {Array.from({ length: 5 }, (_, s) => (
                        <span
                          key={s}
                          className={cn(
                            'text-base',
                            s < item.rating ? 'text-warning' : 'text-muted-foreground/30'
                          )}
                        >
                          ★
                        </span>
                      ))}
                    </span>
                    <span className="sr-only">{tc('ratingSr', { rating: item.rating })}</span>
                  </div>
                  <p className="italic leading-relaxed mb-4 text-[0.9375rem] text-foreground line-clamp-4">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div>
                    <p className="font-semibold text-sm text-foreground truncate">{item.name}</p>
                    <p className="text-[0.8125rem] text-muted-foreground truncate">{item.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
