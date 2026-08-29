import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A titled region of a platform page. Deliberately not a Card: the content
 * (a table, a list, a bar chart) supplies its own edges, and wrapping every
 * region in a box is what made the old panel read as a template.
 */
export function PlatformSection({
  title,
  description,
  action,
  children,
  className,
  ...props
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={cn('min-w-0', className)} {...props}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0 text-xs">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** Hairline container for tables and lists inside a section. */
export function PlatformPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}
      {...props}
    />
  )
}

/** Shared `<th>` styling so every table on the panel has the same header voice. */
export const TH = 'px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap'
export const TH_RIGHT = `${TH} text-right`
export const TD = 'px-4 py-3 align-middle'
