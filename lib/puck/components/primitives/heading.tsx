import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'

export type HeadingProps = {
  text: string
  level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  alignment: 'left' | 'center' | 'right'
  color: string
  fontSize: string
  fontWeight: string
}

const fontSizeMap: Record<string, string> = {
  '1.125rem': 'text-lg',
  '1.5rem': 'text-2xl',
  '2rem': 'text-3xl',
  '2.5rem': 'text-4xl',
  '3rem': 'text-5xl',
  '3.75rem': 'text-6xl',
  '4.5rem': 'text-7xl',
}

const fontWeightMap: Record<string, string> = {
  '400': 'font-normal',
  '500': 'font-medium',
  '600': 'font-semibold',
  '700': 'font-bold',
  '800': 'font-extrabold',
  '900': 'font-black',
}

const alignmentMap: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export const Heading: ComponentConfig<HeadingProps> = {
  label: 'Heading',
  fields: {
    text: { type: 'text', label: 'Text' },
    level: {
      type: 'select',
      label: 'Level',
      options: [
        { label: 'H1', value: 'h1' },
        { label: 'H2', value: 'h2' },
        { label: 'H3', value: 'h3' },
        { label: 'H4', value: 'h4' },
        { label: 'H5', value: 'h5' },
        { label: 'H6', value: 'h6' },
      ],
    },
    alignment: {
      type: 'radio',
      label: 'Alignment',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
      ],
    },
    color: { type: 'text', label: 'Color' },
    fontSize: {
      type: 'select',
      label: 'Font Size',
      options: [
        { label: 'Small', value: '1.125rem' },
        { label: 'Medium', value: '1.5rem' },
        { label: 'Large', value: '2rem' },
        { label: 'XL', value: '2.5rem' },
        { label: '2XL', value: '3rem' },
        { label: '3XL', value: '3.75rem' },
        { label: '4XL', value: '4.5rem' },
      ],
    },
    fontWeight: {
      type: 'select',
      label: 'Font Weight',
      options: [
        { label: 'Normal', value: '400' },
        { label: 'Medium', value: '500' },
        { label: 'Semibold', value: '600' },
        { label: 'Bold', value: '700' },
        { label: 'Extra Bold', value: '800' },
        { label: 'Black', value: '900' },
      ],
    },
  },
  defaultProps: {
    text: 'Heading',
    level: 'h2',
    alignment: 'left',
    color: '',
    fontSize: '2rem',
    fontWeight: '700',
  },
  render: ({ text, level, alignment, color, fontSize, fontWeight }) => {
    const Tag = level
    return (
      <Tag
        className={cn(
          'break-words leading-tight text-foreground',
          fontSizeMap[fontSize] || 'text-3xl',
          fontWeightMap[fontWeight] || 'font-bold',
          alignmentMap[alignment] || 'text-left',
        )}
        style={color ? { color } : undefined}
      >
        {text}
      </Tag>
    )
  },
}
