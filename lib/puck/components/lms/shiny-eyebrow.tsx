import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'

export type ShinyEyebrowProps = {
  text: string
  align: 'left' | 'center' | 'right'
}

/** Retain the saved block name; its solid label follows the school theme. */
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
          <span className="text-sm text-foreground">{text}</span>
        </div>
      </div>
    )
  },
}
