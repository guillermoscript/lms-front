import type { ComponentConfig } from '@measured/puck'
import { NumberTicker } from '@/components/ui/number-ticker'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterClass,
  sectionInnerClass,
} from '../../utils/section-spacing'

type AnimatedStat = {
  value: number
  prefix: string
  suffix: string
  label: string
}

export type AnimatedStatsProps = {
  heading: string
  items: AnimatedStat[]
} & SectionSpacingProps

/**
 * Puck wrapper for Magic UI `NumberTicker` (components/ui/number-ticker.tsx, installed via
 * `npx shadcn add @magicui/number-ticker`). Pattern A — imports the primitive and drives it
 * from an editable array. Each stat counts up on scroll into view. Prefix/suffix let editors
 * render values like "+1,200" or "98%" while the animated part stays numeric.
 */
export const AnimatedStats: ComponentConfig<AnimatedStatsProps> = {
  label: 'Animated Stats',
  fields: {
    heading: { type: 'text', label: 'Heading' },
    items: {
      type: 'array',
      label: 'Stats',
      arrayFields: {
        value: { type: 'number', label: 'Value' },
        prefix: { type: 'text', label: 'Prefix' },
        suffix: { type: 'text', label: 'Suffix' },
        label: { type: 'text', label: 'Label' },
      },
      defaultItemProps: { value: 100, prefix: '', suffix: '', label: 'Metric' },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    heading: 'Trusted by learners worldwide',
    items: [
      { value: 1200, prefix: '+', suffix: '', label: 'Courses published' },
      { value: 22000, prefix: '', suffix: '', label: 'Active students' },
      { value: 98, prefix: '', suffix: '%', label: 'Completion rate' },
    ],
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, heading, items }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          {heading && (
            <h2 className="mb-12 text-center text-3xl font-medium lg:text-4xl">{heading}</h2>
          )}
          {items.length > 0 && (
            <div
              className="grid gap-12 text-center md:gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {items.map((stat, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-center text-5xl font-bold tabular-nums">
                    {stat.prefix && <span>{stat.prefix}</span>}
                    <NumberTicker value={stat.value} className="text-foreground" />
                    {stat.suffix && <span>{stat.suffix}</span>}
                  </div>
                  <p className="text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  },
}
