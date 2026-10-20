/**
 * Comped-school expiry notice windows (issue #983, docs/INTERNAL_COMPED_SCHOOLS.md
 * "Comped expiry lifecycle"). Pure and `now`-injectable; the cron route owns I/O.
 *
 * Day arithmetic is whole days, rounded up, like lib/billing/access-cutoff-notice.ts:
 * `1` means "tomorrow", and a window is reached once daysRemaining <= window.
 *
 * Idempotency lives in `tenants.comped_notice_sent` (jsonb): keys '30' | '14' | '3',
 * value = ISO timestamp the window was claimed.
 */

export const NOTICE_WINDOWS = [30, 14, 3] as const
export type NoticeWindow = (typeof NOTICE_WINDOWS)[number]

export type NoticeSentMap = Partial<Record<string, string>>

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days until `compedUntil`, rounded up. <= 0 once expired; null if unparseable. */
export function daysUntil(compedUntil: string | null | undefined, now: Date): number | null {
  if (!compedUntil) return null
  const ms = new Date(compedUntil).getTime()
  if (Number.isNaN(ms)) return null
  const remaining = ms - now.getTime()
  return remaining <= 0 ? 0 : Math.ceil(remaining / DAY_MS)
}

export function isExpired(compedUntil: string | null | undefined, now: Date): boolean {
  if (!compedUntil) return false
  const ms = new Date(compedUntil).getTime()
  if (Number.isNaN(ms)) return false
  return ms <= now.getTime()
}

export interface DueNotice {
  /** The window this notice speaks for (the smallest reached one). */
  window: NoticeWindow
  /** Every reached window to mark as sent: the larger ones are covered, never sent late. */
  covers: NoticeWindow[]
  daysRemaining: number
}

/**
 * The single notice to send now, or null.
 *
 * Rule: send only the SMALLEST reached window, and mark every reached window as
 * sent. A school converted 10 days before expiry has reached 30 and 14 and gets
 * exactly one notice (the 14), not two; the 30 is covered. If the smallest
 * reached window is already sent there is nothing to say (a larger unsent
 * window would be a stale "30 days left" at day 12).
 */
export function dueNoticeWindow(input: {
  compedUntil: string | null | undefined
  sentMap: NoticeSentMap | null | undefined
  now: Date
}): DueNotice | null {
  const { compedUntil, now } = input
  const sent = input.sentMap ?? {}
  const days = daysUntil(compedUntil, now)
  if (days === null || days <= 0) return null // no date, or expired: phase 2's job

  const reached = [...NOTICE_WINDOWS].sort((a, b) => a - b).filter((w) => days <= w)
  if (reached.length === 0) return null
  const smallest = reached[0]
  if (sent[String(smallest)]) return null
  return { window: smallest, covers: reached, daysRemaining: days }
}
