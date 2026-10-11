import { describe, expect, it } from 'vitest'
import { renewalDisplayStatus } from '@/lib/payments/renewal-display-status'

const transaction = {
  status: 'failed' as const, payment_provider: 'solana_subs', provider_subscription_id: 'sub',
  provider_metadata: { kind: 'renewal', period_start: '2030-01-01 00:00:00+00' },
}
const subscription = {
  payment_provider: 'solana_subs', provider_subscription_id: 'sub',
  provider_metadata: { renewal_pending: { period_start: '2030-01-01T00:00:00.000Z' } },
}
describe('unresolved renewal history', () => {
  it('displays the period as pending without changing the failed-attempt audit record', () => {
    expect(renewalDisplayStatus(transaction, [subscription])).toBe('pending')
    expect(transaction.status).toBe('failed')
  })
  it('does not relabel another provider, subscription or period', () => {
    for (const other of [
      { ...subscription, payment_provider: 'stripe' },
      { ...subscription, provider_subscription_id: 'another-sub' },
      { ...subscription, provider_metadata: { renewal_pending: { period_start: '2030-01-02' } } },
    ]) expect(renewalDisplayStatus(transaction, [other])).toBe('failed')
  })
  it('leaves confirmed and refunded receipts unchanged during an unresolved attempt', () => {
    for (const status of ['successful', 'refunded'] as const) {
      expect(renewalDisplayStatus({ ...transaction, status }, [subscription])).toBe(status)
    }
  })
  it('does not turn malformed or missing period metadata into a pending receipt', () => {
    expect(renewalDisplayStatus({ ...transaction, provider_metadata: { kind: 'renewal' } }, [subscription])).toBe('failed')
    expect(renewalDisplayStatus(transaction, [{ ...subscription, provider_metadata: null }])).toBe('failed')
  })
})
