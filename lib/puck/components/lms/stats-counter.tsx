import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'

type StatItem = {
  value: string
  label: string
  prefix: string
  suffix: string
}

export type StatsCounterProps = {
  items: StatItem[]
  alignment: 'left' | 'center'
} & SectionSpacingProps

export const StatsCounter: ComponentConfig<StatsCounterProps> = {
  label: 'Stats Counter',
  fields: {
    items: {
      type: 'array',
      label: 'Stats',
      arrayFields: {
        value: { type: 'text', label: 'Value' },
        label: { type: 'text', label: 'Label' },
        prefix: { type: 'text', label: 'Prefix' },
        suffix: { type: 'text', label: 'Suffix' },
      },
      defaultItemProps: { value: '100', label: 'Students', prefix: '', suffix: '+' },
    },
    alignment: {
      type: 'radio',
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
      ],
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    items: [
      { value: '10,000', label: 'Students', prefix: '', suffix: '+' },
      { value: '500', label: 'Courses', prefix: '', suffix: '+' },
      { value: '50', label: 'Instructors', prefix: '', suffix: '+' },
      { value: '4.9', label: 'Rating', prefix: '', suffix: '/5' },
    ],
    alignment: 'center',
    ...sectionSpacingDefaults,
  },
  render: ({ items, alignment, paddingY, paddingX, maxWidth, marginY }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    if (!items.length) return <></>

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <dl
            className={cn(
              'grid grid-cols-2 md:grid-cols-4 gap-8',
              alignment === 'center' ? 'text-center' : 'text-left'
            )}
          >
            {items.map((stat, i) => (
              <div key={i} className="flex flex-col-reverse transition-transform duration-300 hover:scale-105">
                <dt className="text-sm text-muted-foreground mt-2 uppercase tracking-wider font-medium truncate">
                  {stat.label}
                </dt>
                <dd className="text-4xl font-extrabold leading-none text-foreground">
                  {stat.prefix}{stat.value}{stat.suffix}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    )
  },
}
