'use client'

import { cn } from '@/lib/utils'
import {
  IconInfoCircle,
  IconAlertTriangle,
  IconBulb,
  IconCircleCheck,
  IconAlertCircle,
} from '@tabler/icons-react'

type CalloutType = 'info' | 'warning' | 'tip' | 'success' | 'danger'

interface CalloutProps {
  type?: CalloutType
  title?: string
  children: React.ReactNode
  className?: string
}

const calloutConfig: Record<
  CalloutType,
  { icon: React.ElementType; className: string; defaultTitle: string }
> = {
  info: {
    icon: IconInfoCircle,
    className: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100',
    defaultTitle: 'Información',
  },
  warning: {
    icon: IconAlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
    defaultTitle: 'Advertencia',
  },
  tip: {
    icon: IconBulb,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
    defaultTitle: 'Consejo',
  },
  success: {
    icon: IconCircleCheck,
    className: 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100',
    defaultTitle: 'Correcto',
  },
  danger: {
    icon: IconAlertCircle,
    className: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
    defaultTitle: 'Importante',
  },
}

export function Callout({ type = 'info', title, children, className }: CalloutProps) {
  const config = calloutConfig[type]
  const Icon = config.icon
  const displayTitle = title ?? config.defaultTitle

  return (
    <div
      className={cn(
        'my-4 flex gap-3 rounded-lg border p-4',
        config.className,
        className
      )}
      role="note"
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        {displayTitle && (
          <p className="font-semibold text-sm">{displayTitle}</p>
        )}
        <div className="text-sm [&>p]:mb-2 [&>p:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  )
}

// Alias para uso más sencillo en MDX
export const Info = (props: Omit<CalloutProps, 'type'>) => <Callout type="info" {...props} />
export const Warning = (props: Omit<CalloutProps, 'type'>) => <Callout type="warning" {...props} />
export const Tip = (props: Omit<CalloutProps, 'type'>) => <Callout type="tip" {...props} />
export const Success = (props: Omit<CalloutProps, 'type'>) => <Callout type="success" {...props} />
export const Danger = (props: Omit<CalloutProps, 'type'>) => <Callout type="danger" {...props} />
