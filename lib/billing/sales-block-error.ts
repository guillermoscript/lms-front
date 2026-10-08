/**
 * Recognise the platform fee sales block (issue #929, design 4.3).
 *
 * The `before_transaction_fee_sales_block_insert` trigger and
 * `grant_free_entitlement()` (migration `20261009110000_platform_fee_gate_929.sql`)
 * raise SQLSTATE `LM003` with the message `sales_blocked:fees` when a school
 * whose platform fees are overdue (and only while
 * `platform_fee_config.enforcement_mode = 'enforce'`) tries to take a NEW sale
 * or a new free enrollment. `LM001` is the plan limit, `LM002` the tenant ban.
 *
 * Match on the SQLSTATE first; the message is only a fallback for callers that
 * re-wrap the PostgREST error into a plain `Error`. Safe to import from client
 * code (no server dependencies).
 */

export const SALES_BLOCKED_SQLSTATE = 'LM003'

/** Machine-readable code in API error bodies (`{ error, code }`). */
export const SALES_BLOCKED_CODE = 'SALES_BLOCKED'

/**
 * Neutral student-facing copy (design 4.4): never reveals the school's fee
 * debt. The translated twin is `platformFees.salesBlocked` in messages/*.json.
 */
export const SALES_BLOCKED_MESSAGE = "This school isn't accepting new enrollments right now."

const MESSAGE_PATTERN = /sales_blocked(:fees)?/

/** `true` when `err` is the fee sales block, from the DB or from assertSalesOpen(). */
export function isSalesBlockedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  if (err instanceof SalesBlockedError) return true
  const { code, message } = err as { code?: unknown; message?: unknown }
  return code === SALES_BLOCKED_SQLSTATE || (typeof message === 'string' && MESSAGE_PATTERN.test(message))
}

/** Thrown by the app pre-check (`assertSalesOpen`) before any side effect. */
export class SalesBlockedError extends Error {
  readonly code = SALES_BLOCKED_CODE
  constructor(message: string = SALES_BLOCKED_MESSAGE) {
    super(message)
    this.name = 'SalesBlockedError'
  }
}
