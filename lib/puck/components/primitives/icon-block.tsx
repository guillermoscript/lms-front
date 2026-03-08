import type { ComponentConfig } from '@measured/puck'
import {
  IconStar,
  IconHeart,
  IconCheck,
  IconArrowRight,
  IconInfoCircle,
  IconAlertTriangle,
  IconRocket,
  IconBook,
  IconTrophy,
  IconBolt,
  IconSchool,
  IconLock,
  IconWorld,
  IconCode,
  IconChartBar,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import type { ComponentType, CSSProperties } from 'react'

export type IconBlockProps = {
  icon: string
  size: number
  color: string
  alignment: 'left' | 'center' | 'right'
}

const ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string; style?: CSSProperties }>> = {
  star: IconStar,
  heart: IconHeart,
  check: IconCheck,
  arrow: IconArrowRight,
  info: IconInfoCircle,
  warning: IconAlertTriangle,
  rocket: IconRocket,
  book: IconBook,
  trophy: IconTrophy,
  lightning: IconBolt,
  graduation: IconSchool,
  lock: IconLock,
  globe: IconWorld,
  code: IconCode,
  chart: IconChartBar,
}

const alignmentMap: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export const IconBlock: ComponentConfig<IconBlockProps> = {
  label: 'Icon',
  fields: {
    icon: {
      type: 'select',
      label: 'Icon',
      options: Object.keys(ICON_MAP).map((key) => ({
        label: key.charAt(0).toUpperCase() + key.slice(1),
        value: key,
      })),
    },
    size: { type: 'number', label: 'Size (px)', min: 16, max: 128 },
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
    icon: 'star',
    size: 32,
    color: '',
    alignment: 'center',
  },
  render: ({ icon, size, color, alignment }) => {
    const IconComponent = ICON_MAP[icon] || IconStar

    return (
      <div className={cn(alignmentMap[alignment] || 'text-center')}>
        <span className="inline-flex text-foreground transition-transform duration-300 hover:scale-110" role="img" aria-label={icon}>
          <IconComponent
            size={size}
            className={cn('shrink-0')}
            style={color ? { color } : undefined}
          />
        </span>
      </div>
    )
  },
}
