import { describe, it, expect } from 'vitest'
import { MANUAL_PAYMENT_METHOD, manualTransactionPaymentMethod } from '@/lib/payments/manual-payment-method'

/**
 * #727: a manual sale confirmed without a typed method stored the literal
 * "manual - null" in `transactions.payment_method`, and the Transactions table
 * printed it. The bare `manual` maps to the translated "Manual" label.
 */
describe('manualTransactionPaymentMethod', () => {
  it.each([null, undefined, '', '   ', 'null', 'undefined'])('no method (%j) → bare "manual"', (method) => {
    expect(manualTransactionPaymentMethod(method)).toBe(MANUAL_PAYMENT_METHOD)
  })

  it('appends a typed method, trimmed', () => {
    expect(manualTransactionPaymentMethod('  Bank Transfer ')).toBe('manual - Bank Transfer')
  })

  it('never produces the literal "manual - null"', () => {
    for (const method of [null, undefined, 'null']) {
      expect(manualTransactionPaymentMethod(method)).not.toContain('null')
    }
  })
})
