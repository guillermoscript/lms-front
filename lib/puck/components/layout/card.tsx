import type { ComponentConfig } from '@measured/puck'
import { DropZone } from '@measured/puck'
import { cn } from '@/lib/utils'

export type CardProps = {
  shadow: 'none' | 'sm' | 'md' | 'lg'
  padding: string
  borderRadius: string
}

const shadowMap: Record<string, string> = {
  none: 'shadow-none',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
}

const paddingMap: Record<string, string> = {
  '0': 'p-0',
  '1rem': 'p-4',
  '1.5rem': 'p-6',
  '2rem': 'p-8',
}

const radiusMap: Record<string, string> = {
  '0': 'rounded-none',
  '0.5rem': 'rounded-lg',
  '0.75rem': 'rounded-xl',
  '1rem': 'rounded-2xl',
  '1.5rem': 'rounded-3xl',
}

export const Card: ComponentConfig<CardProps> = {
  label: 'Card',
  fields: {
    shadow: {
      type: 'select',
      label: 'Shadow',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Small', value: 'sm' },
        { label: 'Medium', value: 'md' },
        { label: 'Large', value: 'lg' },
      ],
    },
    padding: {
      type: 'select',
      label: 'Padding',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '1rem' },
        { label: 'Medium', value: '1.5rem' },
        { label: 'Large', value: '2rem' },
      ],
    },
    borderRadius: {
      type: 'select',
      label: 'Border Radius',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '0.5rem' },
        { label: 'Medium', value: '0.75rem' },
        { label: 'Large', value: '1rem' },
        { label: 'XL', value: '1.5rem' },
      ],
    },
  },
  defaultProps: {
    shadow: 'sm',
    padding: '1.5rem',
    borderRadius: '0.75rem',
  },
  render: ({ shadow, padding, borderRadius }) => {
    return (
      <div
        className={cn(
          'bg-card text-card-foreground border border-border transition-shadow duration-300 hover:shadow-lg',
          shadowMap[shadow] || 'shadow-sm',
          paddingMap[padding] || 'p-6',
          radiusMap[borderRadius] || 'rounded-xl'
        )}
      >
        <DropZone zone="content" />
      </div>
    )
  },
}
