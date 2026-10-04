import type { ReactNode } from 'react'
import Link from 'next/link'
import { IconArrowUpRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export type StatTone = 'default' | 'warning' | 'danger' | 'positive'

export interface StatItem {
  label: string
  value: ReactNode
  /** One short line under the value. Only when it adds information the label doesn't. */
  detail?: ReactNode
  href?: string
  /** Colour is reserved for state — pass a tone only when the number itself is a signal. */
  tone?: StatTone
  testId?: string
}

const TONE_VALUE: Record<StatTone, string> = {
  default: 'text-foreground',
  warning: 'text-amber-700 dark:text-amber-400',
  danger: 'text-red-700 dark:text-red-400',
  positive: 'text-emerald-700 dark:text-emerald-400',
}

const COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
}

/**
 * The one way numbers are summarised on the platform panel: a hairline-divided
 * `<dl>` where hierarchy comes from type size, not from icon tiles or per-card
 * colour. A cell with `href` is a stretched link — the whole cell is clickable
 * and an arrow appears on hover so the affordance is visible.
 */
export function StatStrip({
  stats,
  className,
  ...props
}: { stats: StatItem[]; className?: string } & Omit<React.HTMLAttributes<HTMLDListElement>, 'children'>) {
  const cols = COLS[Math.min(Math.max(stats.length, 1), 5)]
  return (
    <dl
      className={cn(
        'grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2',
        cols,
        className,
      )}
      {...props}
    >
      {stats.map((stat) => {
        const tone = stat.tone ?? 'default'
        return (
          <div
            key={stat.label}
            data-testid={stat.testId}
            className={cn(
              'group/stat relative flex min-w-0 flex-col gap-1 px-5 py-4',
              'border-b border-border last:border-b-0 sm:odd:border-r lg:border-b-0 lg:not-last:border-r lg:odd:border-r-0 lg:not-last:odd:border-r',
              stat.href && 'transition-colors hover:bg-muted/40',
            )}
          >
            <dt className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
              {stat.href ? (
                <Link
                  href={stat.href}
                  className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                >
                  {stat.label}
                </Link>
              ) : (
                <span>{stat.label}</span>
              )}
              {stat.href && (
                <IconArrowUpRight
                  className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/stat:opacity-70"
                  aria-hidden="true"
                />
              )}
            </dt>
            <dd
              className={cn('truncate text-2xl font-semibold tracking-tight tabular-nums', TONE_VALUE[tone])}
              data-testid="metric-value"
            >
              {stat.value}
            </dd>
            {stat.detail !== undefined && stat.detail !== null && (
              <dd className="text-xs text-muted-foreground">{stat.detail}</dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}
