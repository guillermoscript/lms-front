import type { ComponentConfig } from '@measured/puck'
import { DropZone } from '@measured/puck'
import { cn } from '@/lib/utils'

export type GridProps = {
  columns: string
  gap: string
  minItemWidth: string
}

const gapMap: Record<string, string> = {
  '0.75rem': 'gap-3',
  '1rem': 'gap-4',
  '1.5rem': 'gap-6',
  '2rem': 'gap-8',
}

const colsMap: Record<string, string> = {
  '2': 'grid-cols-1 md:grid-cols-2',
  '3': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  '4': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  '5': 'grid-cols-1 md:grid-cols-3 lg:grid-cols-5',
  '6': 'grid-cols-1 md:grid-cols-3 lg:grid-cols-6',
}

export const Grid: ComponentConfig<GridProps> = {
  label: 'Grid',
  fields: {
    columns: {
      type: 'select',
      label: 'Columns',
      options: [
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
        { label: '5', value: '5' },
        { label: '6', value: '6' },
      ],
    },
    gap: {
      type: 'select',
      label: 'Gap',
      options: [
        { label: 'Small', value: '0.75rem' },
        { label: 'Medium', value: '1rem' },
        { label: 'Large', value: '1.5rem' },
        { label: 'XL', value: '2rem' },
      ],
    },
    minItemWidth: {
      type: 'select',
      label: 'Min Item Width',
      options: [
        { label: 'Auto', value: 'auto' },
        { label: '200px', value: '200px' },
        { label: '250px', value: '250px' },
        { label: '300px', value: '300px' },
      ],
    },
  },
  defaultProps: {
    columns: '3',
    gap: '1.5rem',
    minItemWidth: 'auto',
  },
  render: ({ columns, gap, minItemWidth }) => {
    const count = parseInt(columns, 10)
    const cells = Array.from({ length: count }, (_, i) => `cell-${i + 1}`)
    const useAutoFill = minItemWidth !== 'auto'

    return (
      <div
        className={cn(
          'grid',
          !useAutoFill && (colsMap[columns] || 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'),
          gapMap[gap] || 'gap-6'
        )}
        style={
          useAutoFill
            ? { gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}, 1fr))` }
            : undefined
        }
      >
        {cells.map(zone => (
          <div key={zone}>
            <DropZone zone={zone} />
          </div>
        ))}
      </div>
    )
  },
}
