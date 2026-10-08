import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must be injected in these tests')
  },
}))

import {
  isSalesBlockedError,
  SALES_BLOCKED_CODE,
  SALES_BLOCKED_SQLSTATE,
  SalesBlockedError,
} from '@/lib/billing/sales-block-error'
import { assertSalesOpen, isSalesOpen } from '@/lib/billing/sales-gate'

describe('isSalesBlockedError (#929)', () => {
  it('maps the trigger SQLSTATE', () => {
    expect(SALES_BLOCKED_SQLSTATE).toBe('LM003')
    expect(isSalesBlockedError({ code: 'LM003', message: 'whatever' })).toBe(true)
  })

  it('falls back to the message when the code was lost upstream', () => {
    expect(isSalesBlockedError(new Error('sales_blocked:fees'))).toBe(true)
  })

  it('does not confuse the plan limit (LM001) or the tenant ban (LM002)', () => {
    expect(isSalesBlockedError({ code: 'LM001', message: 'plan_limit_exceeded:courses' })).toBe(false)
    expect(isSalesBlockedError({ code: 'LM002', message: 'tenant_banned' })).toBe(false)
    expect(isSalesBlockedError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isSalesBlockedError(null)).toBe(false)
    expect(isSalesBlockedError('LM003')).toBe(false)
  })

  it('recognises the app pre-check error and carries the API code', () => {
    const err = new SalesBlockedError()
    expect(isSalesBlockedError(err)).toBe(true)
    expect(err.code).toBe(SALES_BLOCKED_CODE)
    // Neutral copy: never mentions fees or debt to students (design 4.4).
    expect(err.message).not.toMatch(/fee|debt|owe|overdue/i)
  })
})

function clientReturning(result: { data?: unknown; error?: unknown } | Error) {
  const rpc = vi.fn(async () => {
    if (result instanceof Error) throw result
    return { data: result.data ?? null, error: result.error ?? null }
  })
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('assertSalesOpen (#929)', () => {
  const ctx = { kind: 'transaction' as const, userId: 'u1', planId: '7', paymentProvider: 'manual' }

  it('passes the exact row shape to the shared SQL predicate', async () => {
    const { client, rpc } = clientReturning({ data: true })
    await assertSalesOpen('t1', { ...ctx, providerSubscriptionId: 'sub_1' }, client)
    expect(rpc).toHaveBeenCalledWith('transaction_sales_gate_allows', {
      _tenant_id: 't1',
      _user_id: 'u1',
      _product_id: null,
      _plan_id: 7,
      _payment_provider: 'manual',
      _provider_subscription_id: 'sub_1',
    })
  })

  it('throws SalesBlockedError when the gate says no', async () => {
    const { client } = clientReturning({ data: false })
    await expect(assertSalesOpen('t1', ctx, client)).rejects.toBeInstanceOf(SalesBlockedError)
  })

  it('uses free_enrollment_allowed for free self-enrollment', async () => {
    const { client, rpc } = clientReturning({ data: false })
    expect(await isSalesOpen('t1', { kind: 'free_enrollment', userId: 'u1', courseId: '12' }, client)).toBe(false)
    expect(rpc).toHaveBeenCalledWith('free_enrollment_allowed', { _tenant_id: 't1', _user_id: 'u1', _course_id: 12 })
  })

  it('fails OPEN on a query error or a throw (unknown state must not stop sales)', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await isSalesOpen('t1', ctx, clientReturning({ error: { code: '42501', message: 'denied' } }).client)).toBe(true)
    expect(await isSalesOpen('t1', ctx, clientReturning(new Error('network')).client)).toBe(true)
    await expect(assertSalesOpen('t1', ctx, clientReturning(new Error('network')).client)).resolves.toBeUndefined()
    quiet.mockRestore()
  })
})
