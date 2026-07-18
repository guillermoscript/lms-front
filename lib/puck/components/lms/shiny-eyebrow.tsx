import type { ComponentConfig } from '@measured/puck'
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text'
import { cn } from '@/lib/utils'

export type ShinyEyebrowProps = {
  text: string
  align: 'left' | 'center' | 'right'
}

/**
 * Puck wrapper for Magic UI `AnimatedShinyText` (components/ui/animated-shiny-text.tsx,
 * installed via `npx shadcn add @magicui/animated-shiny-text`). Pattern A — imports the
 * primitive and exposes its text + alignment as fields. Useful as an eyebrow/announcement
 * label above headings.
 */
export const ShinyEyebrow: ComponentConfig<ShinyEyebrowProps> = {
  label: 'Shiny Eyebrow',
  fields: {
    text: { type: 'text', label: 'Text' },
    align: {
      type: 'radio',
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
      ],
    },
  },
  defaultProps: {
    text: '✨ Introducing our new course builder',
    align: 'center',
  },
  render: ({ text, align }) => {
    const justify =
      align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center'
    return (
      <div className={cn('flex w-full py-2', justify)}>
        <div className="rounded-full border border-border bg-muted px-4 py-1.5 transition-colors hover:bg-muted/70">
          <AnimatedShinyText className="text-sm">{text}</AnimatedShinyText>
        </div>
      </div>
    )
  },
}
