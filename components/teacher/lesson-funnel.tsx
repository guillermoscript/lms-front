/**
 * Where the cohort stops: one bar per published lesson, in sequence, showing
 * how many enrolled students completed it (#647).
 *
 * The teacher reads it for the *drop*, not the bar — a lesson whose count is
 * much lower than the one before it is where students leave, and that is the
 * lesson to revisit. The step-to-step drop is printed next to each bar so the
 * eye does not have to compute it.
 *
 * Plain component, no hooks: it renders inside the client-side Students tab
 * with copy passed in already translated.
 */

import { cn } from '@/lib/utils'
import type { LessonFunnelStep } from '@/lib/analytics/student-progress'

export function LessonFunnel({
  steps,
  total,
  labels,
}: {
  steps: LessonFunnelStep[]
  /** Enrolled students — the denominator for every bar. */
  total: number
  labels: {
    /** e.g. "{count} of {total}" already formatted per row */
    completedBy: (count: number, total: number) => string
    /** Meter aria-label per row */
    meter: (title: string) => string
    empty: string
  }
}) {
  if (steps.length === 0 || total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
  }

  return (
    <ol className="space-y-1.5">
      {steps.map((step, i) => {
        const pct = Math.round((step.completedBy / total) * 100)
        const prev = i === 0 ? total : steps[i - 1].completedBy
        const drop = prev - step.completedBy
        // A drop of a third or more of the previous step is the signal worth colouring.
        const sharp = prev > 0 && drop / prev >= 1 / 3 && drop >= 2
        return (
          <li key={step.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
            <span className="text-right tabular-nums text-muted-foreground">
              {step.sequence ?? i + 1}
            </span>
            <div className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate">{step.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {labels.completedBy(step.completedBy, total)}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-valuenow={step.completedBy}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-label={labels.meter(step.title)}
              >
                <div
                  className={cn('h-full rounded-full', sharp ? 'bg-amber-500' : 'bg-primary/70')}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span
              className={cn(
                'w-10 text-right text-xs tabular-nums',
                sharp ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
              )}
              aria-hidden={drop === 0}
            >
              {drop > 0 ? `−${drop}` : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
