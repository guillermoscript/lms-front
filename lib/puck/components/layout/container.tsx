import type { ComponentConfig } from '@measured/puck'
import { DropZone } from '@measured/puck'
import { cn } from '@/lib/utils'

export type ContainerProps = {
  maxWidth: string
  padding: string
  alignment: 'left' | 'center' | 'right'
}

const maxWidthMap: Record<string, string> = {
  '640px': 'max-w-screen-sm',
  '768px': 'max-w-screen-md',
  '1024px': 'max-w-screen-lg',
  '1280px': 'max-w-screen-xl',
  '100%': 'max-w-full',
}

const paddingMap: Record<string, string> = {
  '0': 'p-0',
  '1rem': 'p-4',
  '1.5rem': 'p-6',
  '2rem': 'p-8',
}

const alignmentMap: Record<string, string> = {
  left: 'mr-auto',
  center: 'mx-auto',
  right: 'ml-auto',
}

export const Container: ComponentConfig<ContainerProps> = {
  label: 'Container',
  fields: {
    maxWidth: {
      type: 'select',
      label: 'Max Width',
      options: [
        { label: 'Small (640px)', value: '640px' },
        { label: 'Medium (768px)', value: '768px' },
        { label: 'Large (1024px)', value: '1024px' },
        { label: 'XL (1280px)', value: '1280px' },
        { label: 'Full', value: '100%' },
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
    maxWidth: '1280px',
    padding: '1.5rem',
    alignment: 'center',
  },
  render: ({ maxWidth, padding, alignment }) => {
    return (
      <div
        className={cn(
          maxWidthMap[maxWidth] || 'max-w-screen-xl',
          paddingMap[padding] || 'p-6',
          alignmentMap[alignment]
        )}
      >
        <DropZone zone="content" />
      </div>
    )
  },
}
