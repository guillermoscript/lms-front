import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Page title row for the platform panel. `title` is the only required part —
 * the description exists for pages whose scope needs one sentence of framing
 * (what counts, what doesn't), not for restating the title.
 */
export function PlatformPageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Small secondary line rendered above the title (e.g. a back link or eyebrow). */
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        {meta && <div className="mb-2 text-xs text-muted-foreground">{meta}</div>}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
