import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'

export type DividerProps = {
  style: 'line' | 'dashed' | 'dotted' | 'gradient' | 'space'
  color: string
  thickness: string
}

const thicknessMap: Record<string, string> = {
  '1px': 'border-t',
  '2px': 'border-t-2',
  '4px': 'border-t-4',
}

const gradientThicknessMap: Record<string, string> = {
  '1px': 'h-px',
  '2px': 'h-0.5',
  '4px': 'h-1',
}

export const Divider: ComponentConfig<DividerProps> = {
  label: 'Divider',
  fields: {
    style: {
      type: 'select',
      label: 'Style',
      options: [
        { label: 'Line', value: 'line' },
        { label: 'Dashed', value: 'dashed' },
        { label: 'Dotted', value: 'dotted' },
        { label: 'Gradient', value: 'gradient' },
        { label: 'Space', value: 'space' },
      ],
    },
    color: { type: 'text', label: 'Color' },
    thickness: {
      type: 'select',
      label: 'Thickness',
      options: [
        { label: 'Thin (1px)', value: '1px' },
        { label: 'Medium (2px)', value: '2px' },
        { label: 'Thick (4px)', value: '4px' },
      ],
    },
  },
  defaultProps: {
    style: 'line',
    color: '',
    thickness: '1px',
  },
  render: ({ style: dividerStyle, color, thickness }) => {
    if (dividerStyle === 'space') {
      return <div className="h-8" />
    }

    if (dividerStyle === 'gradient') {
      return (
        <div
          className={cn(
            'bg-gradient-to-r from-transparent via-border to-transparent',
            gradientThicknessMap[thickness] || 'h-px',
          )}
          style={color ? { backgroundImage: `linear-gradient(to right, transparent, ${color}, transparent)` } : undefined}
        />
      )
    }

    return (
      <hr
        className={cn(
          'm-0 border-none border-border',
          thicknessMap[thickness] || 'border-t',
          dividerStyle === 'dashed' && 'border-dashed',
          dividerStyle === 'dotted' && 'border-dotted',
          dividerStyle === 'line' && 'border-solid',
        )}
        style={color ? { borderColor: color } : undefined}
      />
    )
  },
}
