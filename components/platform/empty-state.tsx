import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Empty state that says what *would* fill the space and, when there is one,
 * offers the next action — never a bare "No results."
 */
export function PlatformEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: {
  icon?: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div
      className={cn('flex flex-col items-center px-6 py-12 text-center', className)}
      {...props}
    >
      {Icon && (
        <Icon className="mb-3 size-6 text-muted-foreground/60" strokeWidth={1.5} aria-hidden="true" />
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground text-pretty">{description}</p>
      )}
      {action && <div className="mt-4 text-xs">{action}</div>}
    </div>
  )
}
