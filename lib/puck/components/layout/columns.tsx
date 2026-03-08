import type { ComponentConfig } from '@measured/puck'
import { DropZone } from '@measured/puck'
import { cn } from '@/lib/utils'

export type ColumnsProps = {
  columnCount: '2' | '3' | '4'
  gap: string
  verticalAlign: 'top' | 'center' | 'bottom' | 'stretch'
  stackOnMobile: boolean
}

const gapMap: Record<string, string> = {
  '0': 'gap-0',
  '1rem': 'gap-4',
  '1.5rem': 'gap-6',
  '2rem': 'gap-8',
  '3rem': 'gap-12',
}

const colsMap: Record<string, string> = {
  '2': 'md:grid-cols-2',
  '3': 'md:grid-cols-3',
  '4': 'md:grid-cols-4',
}

const alignMap: Record<string, string> = {
  top: 'items-start',
  center: 'items-center',
  bottom: 'items-end',
  stretch: 'items-stretch',
}

export const Columns: ComponentConfig<ColumnsProps> = {
  label: 'Columns',
  fields: {
    columnCount: {
      type: 'select',
      label: 'Columns',
      options: [
        { label: '2 Columns', value: '2' },
        { label: '3 Columns', value: '3' },
        { label: '4 Columns', value: '4' },
      ],
    },
    gap: {
      type: 'select',
      label: 'Gap',
      options: [
        { label: 'None', value: '0' },
        { label: 'Small', value: '1rem' },
        { label: 'Medium', value: '1.5rem' },
        { label: 'Large', value: '2rem' },
        { label: 'XL', value: '3rem' },
      ],
    },
    verticalAlign: {
      type: 'select',
      label: 'Vertical Alignment',
      options: [
        { label: 'Top', value: 'top' },
        { label: 'Center', value: 'center' },
        { label: 'Bottom', value: 'bottom' },
        { label: 'Stretch', value: 'stretch' },
      ],
    },
    stackOnMobile: {
      type: 'radio',
      label: 'Stack on Mobile',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
  },
  defaultProps: {
    columnCount: '2',
    gap: '1.5rem',
    verticalAlign: 'top',
    stackOnMobile: true,
  },
  render: ({ columnCount, gap, verticalAlign, stackOnMobile }) => {
    const count = parseInt(columnCount)
    const zones = Array.from({ length: count }, (_, i) => `col-${i + 1}`)

    return (
      <div
        className={cn(
          'grid',
          stackOnMobile ? 'grid-cols-1' : colsMap[columnCount],
          stackOnMobile && colsMap[columnCount],
          gapMap[gap] || 'gap-6',
          alignMap[verticalAlign]
        )}
      >
        {zones.map(zone => (
          <div key={zone}>
            <DropZone zone={zone} />
          </div>
        ))}
      </div>
    )
  },
}
