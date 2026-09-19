import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import type { LandingTestimonial, PuckMetadata } from '../../types'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

type TestimonialItem = {
  name: string
  role: string
  quote: string
  rating: number
}

export type TestimonialGridProps = {
  title: string
  subtitle: string
  items: TestimonialItem[]
} & SectionSpacingProps

export const TestimonialGrid: ComponentConfig<TestimonialGridProps> = {
  label: 'Testimonials',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
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
  render: ({ title, subtitle, items, paddingY, paddingX, maxWidth, marginY, puck }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }

    // Real course reviews resolved server-side and handed in via metadata. When present we
    // render the tenant's actual testimonials; otherwise fall back to placeholders so the
    // canvas is never empty.
    const live = ((puck?.metadata as PuckMetadata | undefined)?.testimonials ?? []) as LandingTestimonial[]
    const resolvedItems: TestimonialItem[] = live.length > 0
      ? live.map((tm) => ({
          name: tm.name,
          role: tm.courseTitle ?? '',
          quote: tm.quote,
          rating: tm.rating ?? 5,
        }))
      : (items ?? [])

    if (!resolvedItems.length) return <></>

    const gridCols = resolvedItems.length <= 2
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div>
            {title && (
              <h2 className="text-3xl font-bold text-center text-foreground mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-center text-muted-foreground mb-10">{subtitle}</p>
            )}
            <div className={cn('grid gap-6', gridCols)}>
              {resolvedItems.map((item, i) => (
                <div
                  key={i}
                  className="p-6 rounded-card border border-border bg-card transition-all duration-300 hover:shadow-md hover:-translate-y-1"
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
                    <span className="sr-only">{item.rating} out of 5 stars</span>
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
