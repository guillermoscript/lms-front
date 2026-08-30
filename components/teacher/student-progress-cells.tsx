'use client'

/**
 * Small presentational cells shared by the Students tab table and the
 * per-student sheet (#647). Copy arrives pre-translated; these render layout,
 * state and colour only.
 *
 * Colour is never the only carrier of meaning here: every status badge pairs
 * its tone with an icon and a text label, so it survives an arbitrary tenant
 * primary and a colour-blind reader alike (PRODUCT.md, principle 3).
 */

import type { ReactNode } from 'react'
import { useFormatter } from 'next-intl'
import {
  IconCircleCheck,
  IconCircleDashed,
  IconPlayerPlay,
  IconPlayerPause,
} from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EngagementStatus } from '@/lib/analytics/student-progress'

const STATUS_STYLE: Record<EngagementStatus, { icon: typeof IconCircleCheck; className: string }> = {
  active: {
    icon: IconPlayerPlay,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  stalled: {
    icon: IconPlayerPause,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  not_started: {
    icon: IconCircleDashed,
    className: 'border-border bg-muted/40 text-muted-foreground',
  },
  completed: {
    icon: IconCircleCheck,
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
}

export function EngagementBadge({
  status,
  label,
  title,
  className,
}: {
  status: EngagementStatus
  label: string
  /** Hover text that explains the rule behind the status. */
  title?: string
  className?: string
}) {
  const { icon: Icon, className: tone } = STATUS_STYLE[status]
  return (
    <Badge
      variant="outline"
      title={title}
      data-status={status}
      className={cn('gap-1 whitespace-nowrap font-medium', tone, className)}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </Badge>
  )
}

/**
 * A progress bar with its number. Renders a dash when there is nothing to
 * measure (`total === 0`) instead of an honest-looking 0% — a course with no
 * published lessons has no progress, not zero progress.
 */
export function ProgressCell({
  value,
  total,
  label,
  emptyLabel,
  className,
}: {
  value: number
  total: number
  label: string
  emptyLabel: string
  className?: string
}) {
  if (total === 0) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)} title={emptyLabel}>
        —
      </span>
    )
  }
  return (
    <div className={cn('flex min-w-28 items-center gap-2', className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full', value >= 100 ? 'bg-primary' : 'bg-primary/70')}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-sm font-semibold tabular-nums">{value}%</span>
    </div>
  )
}

/** "3 / 5" with the denominator muted, or a dash when there is no denominator. */
export function CountCell({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-muted-foreground">—</span>
  return (
    <span className="tabular-nums">
      <span className={cn('font-medium', done === total && 'text-primary')}>{done}</span>
      <span className="text-muted-foreground"> / {total}</span>
    </span>
  )
}

/**
 * "3 days ago" with the exact timestamp on hover. The reference `now` comes
 * from the report the server built, so server and client render the same
 * string and hydration never disagrees.
 */
export function ActivityTime({
  value,
  now,
  emptyLabel,
  className,
}: {
  value: string | null
  now: string
  emptyLabel: string
  className?: string
}) {
  const format = useFormatter()
  if (!value) return <span className={cn('text-muted-foreground', className)}>{emptyLabel}</span>
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return <span className={cn('text-muted-foreground', className)}>{emptyLabel}</span>
  }
  return (
    <time
      dateTime={date.toISOString()}
      title={format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' })}
      className={cn('whitespace-nowrap', className)}
    >
      {format.relativeTime(date, new Date(now))}
    </time>
  )
}

/** A dense definition-list row used in the sheet header. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}
