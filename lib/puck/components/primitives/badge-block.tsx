import type { ComponentConfig } from '@measured/puck'
import { Badge } from '@/components/ui/badge'
import { readableOn } from '@/lib/color/contrast'

export type BadgeBlockProps = {
  text: string
  variant: 'solid' | 'outline' | 'subtle'
  color: string
}

const variantMap: Record<string, 'default' | 'outline' | 'secondary'> = {
  solid: 'default',
  outline: 'outline',
  subtle: 'secondary',
}

export const BadgeBlock: ComponentConfig<BadgeBlockProps> = {
  label: 'Badge',
  fields: {
    text: { type: 'text', label: 'Text' },
    variant: {
      type: 'select',
      label: 'Variant',
      options: [
        { label: 'Solid', value: 'solid' },
        { label: 'Outline', value: 'outline' },
        { label: 'Subtle', value: 'subtle' },
      ],
    },
    color: { type: 'text', label: 'Color' },
  },
  defaultProps: {
    text: 'Badge',
    variant: 'subtle',
    color: '',
  },
  render: ({ text, variant, color }) => {
    if (!text) return <></>

    const badgeVariant = variantMap[variant] || 'default'
    // #569: the solid variant's inline background outlives the variant class's
    // `text-primary-foreground`. An unparseable color keeps that class instead.
    const solidInk = readableOn(color, '')

    return (
      <Badge
        variant={badgeVariant}
        className="truncate max-w-full text-xs font-semibold uppercase tracking-wide"
        style={
          color
            ? {
                ...(variant === 'solid'
                  ? {
                      backgroundColor: color,
                      borderColor: color,
                      ...(solidInk ? { color: solidInk } : {}),
                    }
                  : variant === 'outline'
                    ? { borderColor: color, color }
                    : { backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }),
              }
            : undefined
        }
      >
        {text}
      </Badge>
    )
  },
}
