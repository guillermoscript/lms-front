/**
 * Platform-fee sales block (issue #929). Mirrors lib/billing/sales-block-error.ts
 * (the MCP package cannot import from the app).
 *
 * `enforce_fee_sales_block`, `grant_free_entitlement` and
 * `self_enroll_subscription_course` raise SQLSTATE `LM003` with message
 * `sales_blocked:fees` while a school's platform fees are overdue and
 * enforcement is on. `LM001` is the plan limit (see plan-limits.ts).
 */

export const SALES_BLOCKED_SQLSTATE = "LM003";

/** Neutral copy: never reveals the school's fee debt (design 4.4). */
export const SALES_BLOCKED_MESSAGE =
  "This school isn't accepting new enrollments right now. Please try again later.";

const MESSAGE_PATTERN = /sales_blocked(:fees)?/;

export function isSalesBlockedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return (
    code === SALES_BLOCKED_SQLSTATE ||
    (typeof message === "string" && MESSAGE_PATTERN.test(message))
  );
}
