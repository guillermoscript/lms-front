import { ButtonLink } from '../../utils/button-link'
import type { ComponentConfig } from '@measured/puck'
import { Button } from '@/components/ui/button'
import { readableOn } from '@/lib/color/contrast'

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
    // #569: the solid variant's inline background outlives the variant class's
    // `text-primary-foreground`. An unparseable color keeps that class instead.
    const solidInk = readableOn(color, '')

    const sharedProps = {
      variant: buttonVariant,
      size: buttonSize,
      className: 'max-w-full whitespace-normal break-words h-auto min-h-10 px-4 py-2 text-sm transition-colors motion-reduce:transition-none',
      style: color
            ? {
                ...(variant === 'solid'
                  ? {
                      backgroundColor: color,
                      borderColor: color,
                      ...(solidInk ? { color: solidInk } : {}),
                    }
                  : { color, borderColor: variant === 'outline' ? color : undefined }),
              }
            : undefined,
    }

    return (
      <div className={alignmentMap[alignment] || 'text-left'}>
        {href && href !== '#' ? (
          <ButtonLink href={href} {...sharedProps}>{label}</ButtonLink>
        ) : (
          <Button {...sharedProps}>{label}</Button>
        )}
      </div>
    )
  },
}
