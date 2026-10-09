import { describe, expect, it } from 'vitest'
import { isUuid, parseFeePaymentInput, parseFeeReason } from '@/lib/billing/platform-fee-admin-input'

const TENANT = '00000000-0000-0000-0000-000000000002'

describe('parseFeeReason', () => {
  it('requires at least 3 non-blank characters and trims', () => {
    expect(parseFeeReason('  ok ')).toEqual({ ok: false, error: 'reason_required' })
    expect(parseFeeReason(undefined)).toEqual({ ok: false, error: 'reason_required' })
    expect(parseFeeReason('  bank transfer 123 ')).toEqual({ ok: true, value: 'bank transfer 123' })
  })
})

describe('parseFeePaymentInput', () => {
  const good = { tenantId: TENANT, currency: 'usd', amount: '12.50', kind: 'offline', reason: 'wire received', reference: '  REF-1 ' }

  it('normalises a valid offline payment', () => {
    expect(parseFeePaymentInput(good)).toEqual({
      ok: true,
      value: { tenantId: TENANT, currency: 'USD', amount: 12.5, kind: 'offline', reason: 'wire received', reference: 'REF-1' },
    })
  })

  it('accepts a waiver and a comma decimal', () => {
    const r = parseFeePaymentInput({ ...good, kind: 'waiver', amount: '3,10', reference: '' })
    expect(r).toMatchObject({ ok: true, value: { kind: 'waiver', amount: 3.1, reference: null } })
  })

  it.each([
    [{ tenantId: 'nope' }, 'invalid_id'],
    [{ kind: 'refund' }, 'invalid_kind'],
    [{ currency: 'US' }, 'invalid_currency'],
    [{ amount: '0' }, 'invalid_amount'],
    [{ amount: '-1' }, 'invalid_amount'],
    [{ amount: '1.234' }, 'invalid_amount'],
    [{ amount: 'abc' }, 'invalid_amount'],
    [{ reason: 'x' }, 'reason_required'],
  ])('refuses %o with %s', (over, error) => {
    expect(parseFeePaymentInput({ ...good, ...over })).toEqual({ ok: false, error })
  })

  it('isUuid only accepts canonical uuids', () => {
    expect(isUuid(TENANT)).toBe(true)
    expect(isUuid('1')).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
})
