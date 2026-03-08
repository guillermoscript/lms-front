import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

export type CourseGridProps = {
  title: string
  subtitle: string
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
    maxItems: 6,
    columns: '3',
    showPrice: true,
    showDescription: true,
    ...sectionSpacingDefaults,
  },
  render: ({ title, subtitle, maxItems, columns, showPrice, showDescription, paddingY, paddingX, maxWidth, marginY }) => {
    const t = useTranslations('puck.render')
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (maxItems <= 0) return <></>

    const placeholders = Array.from({ length: Math.min(maxItems, 6) }, (_, i) => ({
      id: `placeholder-${i}`,
      title: t('course', { number: i + 1 }),
      description: t('courseDescription'),
      price: (i + 1) * 29,
      image: `https://placehold.co/400x225/e2e8f0/64748b?text=Course+${i + 1}`,
    }))

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
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
              {placeholders.map((course) => (
                <div
                  key={course.id}
                  className="group rounded-xl overflow-hidden border border-border bg-card transition-all duration-300 hover:shadow-md hover:-translate-y-1"
                >
                  <div className="aspect-video overflow-hidden">
                    <img
                      src={course.image}
                      alt={course.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-base text-foreground mb-2 truncate">{course.title}</h3>
                    {showDescription && (
                      <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-2">
                        {course.description}
                      </p>
                    )}
                    {showPrice && (
                      <p className="font-bold text-lg text-primary">
                        ${course.price}
                      </p>
                    )}
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
