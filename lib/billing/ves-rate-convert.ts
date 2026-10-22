/**
 * USD → VES conversion for Pago Móvil fee payments. Pure and client-safe; the
 * fetching lives in `ves-rate.ts` (server only).
 */

/** Bolívares per 1 USD, as shown to a school paying a USD fee balance. */
export interface VesRate {
  vesPerUsd: number
  /** `YYYY-MM-DD` of the stored rate. */
  date: string
  /** e.g. `bcv`; suffixed `:stale` when an earlier day's rate is shown. */
  source: string
}

// Plausible VES-per-USD band. Outside it the feed is garbage: refuse, never mis-quote.
const MIN_VES_PER_USD = 0.01
const MAX_VES_PER_USD = 10_000_000

/** Accepts `36.5`, `"36.5"` and `"36,5"` (comma decimal); anything else is null. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalised = trimmed.includes(',') && !trimmed.includes('.') ? trimmed.replace(',', '.') : trimmed.replace(/,/g, '')
  const n = Number(normalised)
  return Number.isFinite(n) ? n : null
}

/** Read a dot path (`data.usd.promedio`, `0.price`) out of a JSON body and bound-check it. */
export function extractVesPerUsd(body: unknown, path: string): number | null {
  let cursor: unknown = body
  for (const part of path.split('.').filter(Boolean)) {
    if (cursor === null || typeof cursor !== 'object') return null
    cursor = (cursor as Record<string, unknown>)[part]
  }
  const n = toNumber(cursor)
  return n !== null && n >= MIN_VES_PER_USD && n <= MAX_VES_PER_USD ? n : null
}

/** USD amount in bolívares, rounded to cents. Null for a non-positive or non-finite amount. */
export function usdToVes(usd: number, vesPerUsd: number): number | null {
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(vesPerUsd) || vesPerUsd <= 0) return null
  return Math.round(usd * vesPerUsd * 100) / 100
}
