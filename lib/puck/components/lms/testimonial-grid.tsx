import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
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
      defaultItemProps: { name: 'Student', role: 'Student', quote: 'Great experience!', rating: 5 },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    title: 'What Our Students Say',
    subtitle: '',
    items: [
      { name: 'Maria S.', role: 'Web Developer', quote: 'The courses are incredibly well-structured. I went from beginner to professional in just 3 months.', rating: 5 },
      { name: 'Carlos R.', role: 'Data Analyst', quote: 'Best online learning platform I have used. The AI tutor is a game changer.', rating: 5 },
      { name: 'Ana L.', role: 'UX Designer', quote: 'The gamification keeps me motivated every day. Already on a 30-day streak!', rating: 5 },
    ],
    ...sectionSpacingDefaults,
  },
  render: ({ title, subtitle, items, paddingY, paddingX, maxWidth, marginY }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (!items.length) return <></>

    const gridCols = items.length <= 2
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
              {items.map((item, i) => (
                <div
                  key={i}
                  className="p-6 rounded-xl border border-border bg-card transition-all duration-300 hover:shadow-md hover:-translate-y-1"
                >
                  <div className="flex gap-1 mb-4">
                    <span aria-hidden="true" className="flex gap-1">
                      {Array.from({ length: 5 }, (_, s) => (
                        <span
                          key={s}
                          className={cn(
                            'text-base',
                            s < item.rating ? 'text-amber-500' : 'text-muted-foreground/30'
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
