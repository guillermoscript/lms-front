import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterProps, sectionInnerProps } from '../../utils/section-spacing'
import { BlockIcon } from '../../utils/block-icon'
import { accentColorField, accentVars } from '../../utils/accent-color'

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
  accentColor: string
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
        icon: { type: 'text', label: 'Icon (name or emoji)' },
        title: { type: 'text', label: 'Title' },
        description: { type: 'textarea', label: 'Description' },
      },
      defaultItemProps: { icon: 'star', title: 'Feature', description: 'Description' },
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
    accentColor: accentColorField,
    ...sectionSpacingFields,
  },
  defaultProps: {
    title: 'Why Choose Us',
    subtitle: 'Everything you need to succeed in your learning journey.',
    items: [
      { icon: 'graduation', title: 'Expert Instructors', description: 'Learn from industry professionals with years of experience.' },
      { icon: 'book', title: 'Structured Courses', description: 'Well-organized curriculum designed for effective learning.' },
      { icon: 'trophy', title: 'Certificates', description: 'Earn verifiable certificates upon course completion.' },
    ],
    columns: '3',
    accentColor: '',
    ...sectionSpacingDefaults,
  },
  render: ({ title, subtitle, items, columns, accentColor, paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }
    if (!items.length) return <></>

    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing, accentVars(accentColor))}>
          <div className="max-w-2xl">
            {title && (
              <h2 className="text-3xl font-semibold tracking-tight text-balance text-foreground md:text-4xl">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-4 text-lg text-muted-foreground leading-relaxed">{subtitle}</p>
            )}
          </div>
          <div className={cn('grid gap-x-8 gap-y-10', title || subtitle ? 'mt-12' : '', columnClasses[columns])}>
            {items.map((item, i) => (
              <div key={i} className="border-t border-border pt-6">
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--block-accent)_12%,transparent)] text-xl text-[var(--block-accent)]">
                  <BlockIcon name={item.icon} className="size-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground break-words">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed break-words">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
}
