/**
 * The one status ramp every widget shares.
 *
 * WHY THIS EXISTS
 *   Two widgets each carried a private copy of "percent → colour"
 *   (`completionColor` in school-overview, `progressColor` in
 *   student-progress-roster). Both ran amber → **brand** → green, which put the
 *   school's brand colour in the middle of a severity scale: on the default
 *   palette a 64% bar rendered violet, and violet is the accent colour used all
 *   over these widgets for things that carry no status at all. One colour, two
 *   meanings — and the reader has to know which is which.
 *
 *   The epic (#571) already settled the rule: "Accents theme, status colours
 *   (red/amber/green) deliberately do not." So status is red/amber/green only,
 *   brand stays out of it, and a school that themes its widgets orange does not
 *   end up with an orange bar that reads as a warning.
 *
 *   The two copies had also already drifted — at exactly 0% one returned zinc
 *   and the other red — which is the usual argument for having one of these
 *   instead of two.
 *
 * NO DATA vs A REAL ZERO
 *   These are different and they must not look the same. A draft course with no
 *   lessons has nothing to complete (neutral); a student enrolled for a month
 *   who has completed nothing is at 0% and that is the worst case (red).
 *   Callers say which they mean by passing `null` for "no denominator" rather
 *   than coercing it to 0.
 */

/** Severity band, worst to best. `none` means "nothing to measure". */
export type Band = "none" | "bad" | "warn" | "good";

/** Percentage (0–100) → band. `null`/`undefined` is "no data", not zero. */
export function band(pct: number | null | undefined): Band {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "none";
  if (pct >= 80) return "good";
  if (pct >= 40) return "warn";
  return "bad";
}

/** Fill colour for a progress bar. */
export function barClass(pct: number | null | undefined): string {
  switch (band(pct)) {
    case "good":
      return "bg-green-600 dark:bg-green-400";
    case "warn":
      return "bg-amber-500 dark:bg-amber-400";
    case "bad":
      return "bg-red-600 dark:bg-red-400";
    default:
      return "bg-zinc-300 dark:bg-zinc-600";
  }
}

/** Text colour for a number that carries the same status as its bar. */
export function textClass(pct: number | null | undefined): string {
  switch (band(pct)) {
    case "good":
      return "text-green-600 dark:text-green-400";
    case "warn":
      return "text-amber-600 dark:text-amber-400";
    case "bad":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-zinc-400 dark:text-zinc-500";
  }
}

/**
 * Neutral text colour, for numbers that are *facts* rather than *verdicts*.
 *
 * The KPI tiles previously coloured two of six numbers with no stated rule
 * (completion violet, at-risk red; students, courses, lessons and exam average
 * left plain), which reads as though those two were singled out for a reason.
 * The rule now is: colour means "this is good or bad". A count of students is
 * neither, so it stays neutral and the coloured tiles mean something.
 */
export const NEUTRAL_TEXT = "text-zinc-900 dark:text-zinc-100";
