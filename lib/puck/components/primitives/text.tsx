import type { ComponentConfig } from '@measured/puck'
import { cn } from '@/lib/utils'

export type TextBlockProps = {
  content: string
  alignment: 'left' | 'center' | 'right'
  color: string
  maxWidth: string
  fontSize: string
}

const fontSizeMap: Record<string, string> = {
  '0.875rem': 'text-sm',
  '1rem': 'text-base',
  '1.125rem': 'text-lg',
  '1.25rem': 'text-xl',
}

const alignmentMap: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

const maxWidthMap: Record<string, string> = {
  none: '',
  '480px': 'max-w-[480px]',
  '640px': 'max-w-[640px]',
  '768px': 'max-w-[768px]',
  '960px': 'max-w-[960px]',
}

export const TextBlock: ComponentConfig<TextBlockProps> = {
  label: 'Text',
  fields: {
    content: { type: 'textarea', label: 'Content' },
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
    maxWidth: {
      type: 'select',
      label: 'Max Width',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Small (480px)', value: '480px' },
        { label: 'Medium (640px)', value: '640px' },
        { label: 'Large (768px)', value: '768px' },
        { label: 'XL (960px)', value: '960px' },
      ],
    },
    fontSize: {
      type: 'select',
      label: 'Font Size',
      options: [
        { label: 'Small', value: '0.875rem' },
        { label: 'Base', value: '1rem' },
        { label: 'Large', value: '1.125rem' },
        { label: 'XL', value: '1.25rem' },
      ],
    },
  },
  defaultProps: {
    content: 'Enter your text here...',
    alignment: 'left',
    color: '',
    maxWidth: 'none',
    fontSize: '1rem',
  },
  render: ({ content, alignment, color, maxWidth, fontSize }) => {
    return (
      <div
        className={cn(
          'leading-relaxed text-foreground',
          fontSizeMap[fontSize] || 'text-base',
          alignmentMap[alignment] || 'text-left',
          maxWidthMap[maxWidth],
          alignment === 'center' && maxWidth !== 'none' && 'mx-auto',
        )}
        style={color ? { color } : undefined}
      >
        {content.split('\n').map((line, i) => (
          <p key={i} className="mb-2 last:mb-0 break-words">
            {line || '\u00A0'}
          </p>
        ))}
      </div>
    )
  },
}
