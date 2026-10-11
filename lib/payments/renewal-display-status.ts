interface RenewalTransaction {
  status: 'successful' | 'pending' | 'failed' | 'canceled' | 'refunded' | 'archived'
  payment_provider: string | null
  provider_subscription_id: string | null
  provider_metadata: { kind?: string; period_start?: string } | null
}
interface RenewalSubscription {
  payment_provider: string
  provider_subscription_id: string | null
  provider_metadata: { renewal_pending?: { period_start?: string } } | null
}

/** Preserve the failed-attempt audit record, but do not claim "not charged"
 * while a newer attempt for that same provider/subscription/period is unresolved.
 * This affects presentation only; no payment or access state is rewritten.
 */
export function renewalDisplayStatus(
  transaction: RenewalTransaction,
  subscriptions: RenewalSubscription[],
): RenewalTransaction['status'] {
  if (transaction.status !== 'failed' || transaction.provider_metadata?.kind !== 'renewal'
    || !transaction.provider_subscription_id) return transaction.status
  const period = Date.parse(transaction.provider_metadata.period_start ?? '')
  if (!Number.isFinite(period)) return transaction.status
  const unresolved = subscriptions.some(sub =>
    sub.payment_provider === transaction.payment_provider
    && sub.provider_subscription_id === transaction.provider_subscription_id
    && Date.parse(sub.provider_metadata?.renewal_pending?.period_start ?? '') === period)
  return unresolved ? 'pending' : transaction.status
}
