import type { ComponentConfig } from '@measured/puck'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ButtonBlockProps = {
  label: string
  href: string
  variant: 'solid' | 'outline' | 'ghost'
  size: 'sm' | 'md' | 'lg'
  color: string
  alignment: 'left' | 'center' | 'right'
}

const variantMap: Record<string, 'default' | 'outline' | 'ghost'> = {
  solid: 'default',
  outline: 'outline',
  ghost: 'ghost',
}

const sizeMap: Record<string, 'sm' | 'default' | 'lg'> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
}

const alignmentMap: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export const ButtonBlock: ComponentConfig<ButtonBlockProps> = {
  label: 'Button',
  fields: {
    label: { type: 'text', label: 'Label' },
    href: { type: 'text', label: 'Link URL' },
    variant: {
      type: 'select',
      label: 'Variant',
      options: [
        { label: 'Solid', value: 'solid' },
        { label: 'Outline', value: 'outline' },
        { label: 'Ghost', value: 'ghost' },
      ],
    },
    size: {
      type: 'select',
      label: 'Size',
      options: [
        { label: 'Small', value: 'sm' },
        { label: 'Medium', value: 'md' },
        { label: 'Large', value: 'lg' },
      ],
    },
    color: { type: 'text', label: 'Color' },
    alignment: {
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
    label: 'Click me',
    href: '#',
    variant: 'solid',
    size: 'md',
    color: '',
    alignment: 'left',
  },
  render: ({ label, href, variant, size, color, alignment }) => {
    const buttonVariant = variantMap[variant] || 'default'
    const buttonSize = sizeMap[size] || 'default'

    const button = (
      <Button
        variant={buttonVariant}
        size={buttonSize}
        className={cn(
          'truncate max-w-full cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]',
        )}
        style={
          color
            ? {
                ...(variant === 'solid'
                  ? { backgroundColor: color, borderColor: color }
                  : { color, borderColor: variant === 'outline' ? color : undefined }),
              }
            : undefined
        }
      >
        {label}
      </Button>
    )

    return (
      <div className={alignmentMap[alignment] || 'text-left'}>
        {href && href !== '#' ? (
          <a href={href} className="inline-block no-underline">
            {button}
          </a>
        ) : (
          button
        )}
      </div>
    )
  },
}
