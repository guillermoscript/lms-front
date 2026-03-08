import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

type FeatureItem = {
  icon: string
  title: string
  description: string
}

export type FeaturesGridProps = {
  title: string
  subtitle: string
  items: FeatureItem[]
  columns: '2' | '3' | '4'
} & SectionSpacingProps

const columnClasses: Record<string, string> = {
  '2': 'grid-cols-1 md:grid-cols-2',
  '3': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  '4': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
}

export const FeaturesGrid: ComponentConfig<FeaturesGridProps> = {
  label: 'Features Grid',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    items: {
      type: 'array',
      label: 'Features',
      arrayFields: {
        icon: { type: 'text', label: 'Icon (emoji)' },
        title: { type: 'text', label: 'Title' },
        description: { type: 'textarea', label: 'Description' },
      },
      defaultItemProps: { icon: '⭐', title: 'Feature', description: 'Description' },
    },
    columns: {
      type: 'select',
      label: 'Columns',
      options: [
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
      ],
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    title: 'Why Choose Us',
    subtitle: 'Everything you need to succeed in your learning journey.',
    items: [
      { icon: '🎓', title: 'Expert Instructors', description: 'Learn from industry professionals with years of experience.' },
      { icon: '📚', title: 'Structured Courses', description: 'Well-organized curriculum designed for effective learning.' },
      { icon: '🏆', title: 'Certificates', description: 'Earn verifiable certificates upon course completion.' },
    ],
    columns: '3',
    ...sectionSpacingDefaults,
  },
  render: ({ title, subtitle, items, columns, paddingY, paddingX, maxWidth, marginY }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (!items.length) return <></>

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="text-center">
            {title && (
              <h2 className="text-3xl font-bold text-foreground mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-lg text-muted-foreground max-w-[640px] mx-auto mb-10 leading-relaxed">
                {subtitle}
              </p>
            )}
            <div className={cn('grid gap-8', columnClasses[columns])}>
              {items.map((item, i) => (
                <div
                  key={i}
                  className="group text-center p-8 rounded-xl border border-border bg-card transition-all duration-300 hover:shadow-md hover:-translate-y-1"
                >
                  <div className="text-4xl mb-4"><span aria-hidden="true" className="inline-block transition-transform duration-300 group-hover:scale-110">{item.icon}</span></div>
                  <h3 className="text-xl font-semibold text-foreground mb-2 break-words">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-[0.9375rem] break-words">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
}
