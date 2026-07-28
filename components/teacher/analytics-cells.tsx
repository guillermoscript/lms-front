/**
 * Presentational cells for the course analytics page.
 *
 * These are server components on purpose — the analytics page has no client
 * interactivity (the look-back window is a plain link), so nothing here needs
 * to ship JavaScript. All copy arrives pre-translated from the page; these
 * render layout and colour only.
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type {
  DifficultyLabel,
  DifficultyMismatch,
  HotspotScope,
} from '@/lib/analytics/confusion-hotspots'

/** The Elo baseline every item is seeded at (see `20260716120000_create_elo_ratings.sql`). */
const BASELINE_RATING = 1500

export function HotspotScopeBadge({
  scope,
  label,
}: {
  scope: HotspotScope
  label: string
}) {
  const variant =
    scope === 'exam_question' ? 'destructive' : scope === 'exercise' ? 'default' : 'secondary'
  return <Badge variant={variant}>{label}</Badge>
}

/**
 * Severity as a compact bar. Colour tracks the same thresholds the page uses to
 * talk about severity, so a red bar always means "most of the group is failing
 * this", never merely "a couple of students struggled".
 */
export function SeverityBar({ value, label }: { value: number; label: string }) {
  // Amber is spelled out rather than themed: severity is a fixed diagnostic
  // scale, and mapping its middle band onto the tenant's brand colour would
  // make "moderately hard" look different in every school.
  const tone =
    value >= 70
      ? 'bg-destructive'
      : value >= 40
        ? 'bg-amber-500'
        : 'bg-muted-foreground/60'

  return (
    <div className="w-28 shrink-0 text-right">
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${value}%` }} />
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

/**
 * The teacher's declared difficulty next to the rating the platform measured.
 *
 * This pairing is the whole point of the calibration section: a label alone
 * says what the author intended, a rating alone is an abstract number, and only
 * the two together answer "is this too hard?".
 */
export function DifficultyDelta({
  declared,
  rating,
  mismatch,
  labels,
}: {
  declared: DifficultyLabel | null
  rating: number
  mismatch: DifficultyMismatch | null
  labels: { declared: string; measured: string; harder: string; easier: string }
}) {
  const delta = rating - BASELINE_RATING
  return (
    <div className="flex items-center gap-4">
      <div className="text-right">
        <Badge variant={declared ? 'outline' : 'ghost'}>{labels.declared}</Badge>
      </div>
      {/* Wide enough for a four-digit signed delta: at w-20 "−210" wrapped onto
          its own line and read as a separate number. */}
      <div className="w-28 text-right">
        <div className="text-sm font-bold tabular-nums">{rating}</div>
        <div className="whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground">
          {labels.measured}
          {delta !== 0 && (
            <span
              className={cn(
                'ml-1 tabular-nums',
                delta > 0 ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {delta > 0 ? '+' : ''}
              {delta}
            </span>
          )}
        </div>
      </div>
      <div className="w-32 shrink-0 text-right">
        {mismatch && (
          <Badge variant={mismatch === 'harder_than_labeled' ? 'destructive' : 'secondary'}>
            {mismatch === 'harder_than_labeled' ? labels.harder : labels.easier}
          </Badge>
        )}
      </div>
    </div>
  )
}
