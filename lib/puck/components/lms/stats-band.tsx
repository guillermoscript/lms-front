import type { ComponentConfig } from '@measured/puck'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterClass,
  sectionInnerClass,
} from '../../utils/section-spacing'

type Stat = {
  value: string
  label: string
}

export type StatsBandProps = {
  heading: string
  subtitle: string
  items: Stat[]
} & SectionSpacingProps

/**
 * Puck wrapper for the Tailark `stats-1` block (installed to components/stats.tsx via
 * `npx shadcn add @tailark/stats-1`).
 *
 * Tailark blocks ship as fully static JSX with hardcoded copy and no props, so they
 * can't be imported into Puck and remain editable. The pattern for these is to port
 * the layout into the Puck `render` and expose the frozen content as editable fields:
 * heading + subtitle become text fields, and the fixed columns become a dynamic array.
 * The original components/stats.tsx is kept as the design reference.
 */
export const StatsBand: ComponentConfig<StatsBandProps> = {
  label: 'Stats Band',
  fields: {
    heading: { type: 'text', label: 'Heading' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    items: {
      type: 'array',
      label: 'Stats',
      arrayFields: {
        value: { type: 'text', label: 'Value' },
        label: { type: 'text', label: 'Label' },
      },
      defaultItemProps: { value: '+1200', label: 'Description' },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    heading: 'Our platform in numbers',
    subtitle:
      'A growing community of learners and educators building courses, tracking progress, and earning certificates every day.',
    items: [
      { value: '+1200', label: 'Courses published' },
      { value: '22,000', label: 'Active students' },
      { value: '+500', label: 'Certificates issued' },
    ],
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, heading, subtitle, items }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY }
    // Guard against a missing array: AI-generated specs (and Puck's Render path, which does
    // not always backfill defaultProps for top-level array props) can deliver `items` as
    // undefined/null. Default to [] so the block degrades gracefully instead of crashing.
    const safeItems = items ?? []

    return (
      <div className={sectionOuterClass(spacing)}>
        <div className={sectionInnerClass(spacing)}>
          <div className="space-y-8 md:space-y-16">
            {(heading || subtitle) && (
              <div className="relative z-10 mx-auto max-w-xl space-y-6 text-center">
                {heading && <h2 className="text-4xl font-medium lg:text-5xl">{heading}</h2>}
                {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
              </div>
            )}

            {safeItems.length > 0 && (
              <div
                className="grid gap-12 divide-y *:text-center md:gap-2 md:divide-x md:divide-y-0"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(safeItems.length, 4)}, minmax(0, 1fr))`,
                }}
              >
                {safeItems.map((stat, i) => (
                  <div key={i} className="space-y-4">
                    <div className="text-5xl font-bold">{stat.value}</div>
                    <p className="text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  },
}
