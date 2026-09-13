/**
 * The `transactions.payment_method` value a completed manual request writes
 * (issue #727).
 *
 * It used to be the template literal `` `manual - ${request.payment_method}` ``
 * with no guard, so an admin who confirmed a transfer without ever typing a
 * method left the Transactions table printing the literal **"manual - null"**.
 * The bare `manual` maps to the `table.methods.manual` label in both catalogs;
 * a method the admin did type is appended so the row still says *how* the
 * money arrived.
 */
export const MANUAL_PAYMENT_METHOD = 'manual'

export function manualTransactionPaymentMethod(method: string | null | undefined): string {
  const trimmed = typeof method === 'string' ? method.trim() : ''
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return MANUAL_PAYMENT_METHOD
  return `${MANUAL_PAYMENT_METHOD} - ${trimmed}`
}
