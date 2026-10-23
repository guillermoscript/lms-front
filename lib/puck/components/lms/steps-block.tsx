import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'
import {
  type SectionSpacingProps,
  sectionSpacingFields,
  sectionSpacingDefaults,
  sectionOuterProps,
  sectionInnerProps,
} from '../../utils/section-spacing'

type Step = { title: string; description: string }

export type StepsBlockProps = {
  title: string
  subtitle: string
  items: Step[]
} & SectionSpacingProps

const colClass: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

/** A numbered process: 2–4 steps in a row, each with a title and a short description. */
export const StepsBlock: ComponentConfig<StepsBlockProps> = {
  label: 'Steps',
  fields: {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'textarea', label: 'Subtitle' },
    items: {
      type: 'array',
      label: 'Steps',
      arrayFields: {
        title: { type: 'text', label: 'Title' },
        description: { type: 'textarea', label: 'Description' },
      },
      defaultItemProps: { title: 'Step', description: 'What happens in this step.' },
    },
    ...sectionSpacingFields,
  },
  defaultProps: {
    ...sectionSpacingDefaults,
    title: 'How it works',
    subtitle: '',
    items: [
      { title: 'Learn the idea', description: 'A short lesson that explains one concept.' },
      { title: 'Practice it', description: 'Apply it right away in a guided exercise.' },
      { title: 'Get feedback', description: 'Find out what to improve and try again.' },
    ],
  },
  render: ({ paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn, title, subtitle, items }) => {
    const spacing = { paddingY, paddingX, maxWidth, marginY, tone, align, anchorId, hideOn }
    const steps = (items ?? []).slice(0, 4)
    if (!steps.length) return <></>

    return (
      <div {...sectionOuterProps(spacing)}>
        <div {...sectionInnerProps(spacing)}>
          {(title || subtitle) && (
            <div className="mb-12 max-w-2xl">
              {title && <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>}
              {subtitle && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{subtitle}</p>}
            </div>
          )}
          <ol className={cn('grid gap-x-8 gap-y-10', colClass[steps.length] ?? colClass[3])}>
            {steps.map((s, i) => (
              <li key={i} className="border-t border-border pt-5">
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 text-xl font-semibold break-words">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground break-words">{s.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    )
  },
}
