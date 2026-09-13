import type { ComponentConfig } from '@measured/puck'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { PuckMetadata } from '../../types'
import { type SectionSpacingProps, sectionSpacingFields, sectionSpacingDefaults, sectionOuterClass, sectionInnerClass } from '../../utils/section-spacing'
import { accentColorField, accentVars } from '../../utils/accent-color'

type StatItem = {
  value: string
  label: string
  prefix: string
  suffix: string
}

export type StatsCounterProps = {
  items: StatItem[]
  alignment: 'left' | 'center'
  useLiveStats: boolean
  accentColor: string
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
    useLiveStats: {
      type: 'radio',
      label: 'Use Live Stats',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    accentColor: accentColorField,
    ...sectionSpacingFields,
  },
  // The default carries no numbers (#724). With "Use Live Stats" on, the
  // school's real Students/Courses/Completions counts arrive through
  // `puck.metadata`; with it off, the school types its own. The old default
  // published "10,000+ Students" and "4.9/5" for a school with neither, and
  // `render` already hides the block when there is nothing to show.
  defaultProps: {
    items: [],
    alignment: 'center',
    useLiveStats: true,
    accentColor: '',
    ...sectionSpacingDefaults,
  },
  render: ({ items, alignment, useLiveStats, accentColor, paddingY, paddingX, maxWidth, marginY, puck }) => {
    const t = useTranslations('puck.render')
    const spacing = { paddingY, paddingX, maxWidth, marginY }

    // Live stats resolved server-side and handed in via metadata. When present and not opted
    // out, render the tenant's real Students/Courses/Completions counts; otherwise keep the
    // manually-entered stats so the section is never empty.
    const liveStats = (puck?.metadata as PuckMetadata | undefined)?.stats
    const nf = new Intl.NumberFormat('en-US')
    const resolvedItems: StatItem[] = (useLiveStats && liveStats)
      ? [
          { value: nf.format(liveStats.students), label: t('statStudents'), prefix: '', suffix: '' },
          { value: nf.format(liveStats.courses), label: t('statCourses'), prefix: '', suffix: '' },
          { value: nf.format(liveStats.completions), label: t('statCompletions'), prefix: '', suffix: '' },
        ]
      : (items ?? [])

    if (!resolvedItems.length) return <></>

    return (
      <div className={sectionOuterClass(spacing)} style={accentVars(accentColor)}>
        <div className={sectionInnerClass(spacing)}>
          <dl
            className={cn(
              'grid grid-cols-2 md:grid-cols-4 gap-8',
              alignment === 'center' ? 'text-center' : 'text-left'
            )}
          >
            {resolvedItems.map((stat, i) => (
              <div key={i} className="flex flex-col-reverse transition-transform duration-300 hover:scale-105">
                <dt className="text-sm text-muted-foreground mt-2 uppercase tracking-wider font-medium truncate">
                  {stat.label}
                </dt>
                <dd className="text-4xl font-extrabold leading-none text-[var(--block-accent)]">
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
