import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const TENANT = '00000000-0000-0000-0000-000000000001'
const PAYMENT = 'pay-1'

const h = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  membership: { role: 'admin' } as { role: string } | null,
  getOrder: vi.fn(),
  captureOrder: vi.fn(),
  dispatch: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => ({ data: h.membership })
      return q
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }))
vi.mock('@/lib/billing/platform-billing', () => ({
  getPlatformBillingProvider: () => ({ getOrder: h.getOrder, captureOrder: h.captureOrder }),
}))
vi.mock('@/lib/billing/platform-webhook-dispatch', () => ({
  dispatchPlatformBillingEvent: h.dispatch,
}))

import { GET } from '@/app/api/billing/fees/paypal/capture/route'

const ORIGIN = 'https://school.example.com'

function call(next?: string) {
  const url = new URL(`${ORIGIN}/api/billing/fees/paypal/capture`)
  url.searchParams.set('token', 'ORDER-1')
  if (next) url.searchParams.set('next', next)
  return GET(new NextRequest(url, { headers: { host: 'school.example.com', 'x-forwarded-proto': 'https' } }))
}

const feeOrder = (over: Record<string, unknown> = {}) => ({
  reference: 'ref-1',
  metadata: { kind: 'platform_fee', tenant_id: TENANT, payment_id: PAYMENT },
  amount: 12.5,
  currency: 'USD',
  ...over,
})

beforeEach(() => {
  h.user = { id: 'user-1' }
  h.membership = { role: 'admin' }
  h.getOrder.mockReset()
  h.captureOrder.mockReset()
  h.dispatch.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('GET /api/billing/fees/paypal/capture', () => {
  it('no session: unauthorized, nothing read or captured', async () => {
    h.user = null
    const res = await call()
    expect(new URL(res.headers.get('location')!).searchParams.get('paypal')).toBe('unauthorized')
    expect(h.getOrder).not.toHaveBeenCalled()
    expect(h.captureOrder).not.toHaveBeenCalled()
    expect(h.dispatch).not.toHaveBeenCalled()
  })

  it('not a fee order: not_fee_order, no capture', async () => {
    h.getOrder.mockResolvedValue(feeOrder({ metadata: { kind: 'student_purchase', tenant_id: TENANT } }))
    const res = await call()
    expect(new URL(res.headers.get('location')!).searchParams.get('paypal')).toBe('not_fee_order')
    expect(h.captureOrder).not.toHaveBeenCalled()
    expect(h.dispatch).not.toHaveBeenCalled()
  })

  it('non-admin of the order tenant: forbidden, no capture', async () => {
    h.getOrder.mockResolvedValue(feeOrder())
    h.membership = { role: 'student' }
    const res = await call()
    expect(new URL(res.headers.get('location')!).searchParams.get('paypal')).toBe('forbidden')
    expect(h.captureOrder).not.toHaveBeenCalled()
    expect(h.dispatch).not.toHaveBeenCalled()

    h.membership = null
    const res2 = await call()
    expect(new URL(res2.headers.get('location')!).searchParams.get('paypal')).toBe('forbidden')
    expect(h.captureOrder).not.toHaveBeenCalled()
  })

  it('admin + COMPLETED capture: dispatches once and redirects to same-origin next', async () => {
    h.getOrder.mockResolvedValue(feeOrder())
    h.captureOrder.mockResolvedValue({ captureId: 'CAP-1', captureStatus: 'COMPLETED', amount: 12.5, currency: 'USD' })
    const res = await call('/es/dashboard/admin/earnings?tab=fees')
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin).toBe(ORIGIN)
    expect(loc.pathname).toBe('/es/dashboard/admin/earnings')
    expect(loc.searchParams.get('tab')).toBe('fees')
    expect(loc.searchParams.get('fee_payment')).toBe(PAYMENT)
    expect(loc.searchParams.get('paypal')).toBeNull()
    expect(h.captureOrder).toHaveBeenCalledTimes(1)
    expect(h.dispatch).toHaveBeenCalledTimes(1)
    expect(h.dispatch.mock.calls[0][0]).toMatchObject({
      type: 'payment.succeeded',
      providerEventId: 'platform-paypal-capture:CAP-1',
      providerPaymentId: 'CAP-1',
      amount: 12.5,
      currency: 'USD',
    })
    expect(h.dispatch.mock.calls[0][1]).toMatchObject({ provider: 'paypal' })
  })

  it('PENDING capture: no dispatch, redirects without error code', async () => {
    h.getOrder.mockResolvedValue(feeOrder())
    h.captureOrder.mockResolvedValue({ captureId: 'CAP-2', captureStatus: 'PENDING' })
    const res = await call()
    const loc = new URL(res.headers.get('location')!)
    expect(loc.searchParams.get('paypal')).toBeNull()
    expect(loc.searchParams.get('fee_payment')).toBe(PAYMENT)
    expect(h.dispatch).not.toHaveBeenCalled()
  })

  it('ORDER_ALREADY_CAPTURED: re-reads the order and settles', async () => {
    h.getOrder
      .mockResolvedValueOnce(feeOrder())
      .mockResolvedValueOnce(feeOrder({ captureId: 'CAP-3', captureStatus: 'COMPLETED' }))
    h.captureOrder.mockRejectedValue(new Error('PayPal 422: ORDER_ALREADY_CAPTURED'))
    const res = await call()
    expect(new URL(res.headers.get('location')!).searchParams.get('paypal')).toBeNull()
    expect(h.getOrder).toHaveBeenCalledTimes(2)
    expect(h.dispatch).toHaveBeenCalledTimes(1)
    expect(h.dispatch.mock.calls[0][0]).toMatchObject({
      providerEventId: 'platform-paypal-capture:CAP-3',
    })
  })

  it('other capture error: capture_failed, no dispatch', async () => {
    h.getOrder.mockResolvedValue(feeOrder())
    h.captureOrder.mockRejectedValue(new Error('boom'))
    const res = await call()
    expect(new URL(res.headers.get('location')!).searchParams.get('paypal')).toBe('capture_failed')
    expect(h.dispatch).not.toHaveBeenCalled()
  })

  it('cross-origin next falls back to the earnings page', async () => {
    h.user = null
    for (const next of ['https://evil.example.org/steal', '//evil.example.org/x']) {
      const res = await call(next)
      const loc = new URL(res.headers.get('location')!)
      expect(loc.origin).toBe(ORIGIN)
      expect(loc.pathname).toBe('/en/dashboard/admin/earnings')
      expect(loc.searchParams.get('paypal')).toBe('unauthorized')
    }
  })
})
