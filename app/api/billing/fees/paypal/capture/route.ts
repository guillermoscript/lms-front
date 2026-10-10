/**
 * PayPal return route for a platform FEE pay-now order (#950).
 *
 * Orders v2 does not auto-capture: after approval PayPal sends the buyer here
 * (`?token=<orderId>&next=<earnings URL>`). We capture the order, and settle
 * the fee ledger only when the CAPTURE is COMPLETED, through the platform
 * dispatcher (`settle_platform_fee_payment`). PENDING waits for the
 * PAYMENT.CAPTURE.COMPLETED webhook.
 *
 * Unlike the student capture route this REQUIRES a session: the caller must be
 * an active admin of the tenant named in the order's own custom_id, otherwise
 * anyone holding an order id could trigger a capture.
 *
 * It also only captures for a `pending` fee payment row (#951). This capture is
 * the one moment PayPal money moves, and an approval link outlives its row: a
 * newer attempt supersedes it, the stale sweep expires it. Capturing then would
 * take money `settle_platform_fee_payment` refuses to credit, so a closed row
 * sends the payer back uncharged (`?paypal=payment_closed`).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PayPalPaymentProvider } from '@/lib/payments/paypal-provider'
import { getPlatformBillingProvider } from '@/lib/billing/platform-billing'
import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'

export const runtime = 'nodejs'

function requestOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  return `${proto}://${host}`
}

/** Follow `next` only when it points back at our own origin. */
function safeTarget(next: string | null, origin: string, fallback: string): URL {
  if (next) {
    try {
      const url = new URL(next, origin)
      if (url.origin === origin) return url
    } catch {
      // fall through
    }
  }
  return new URL(fallback)
}

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('token')
  const origin = requestOrigin(req)
  const target = safeTarget(
    req.nextUrl.searchParams.get('next'),
    origin,
    `${origin}/en/dashboard/admin/earnings`,
  )
  const fail = (code: string) => {
    target.searchParams.set('paypal', code)
    return NextResponse.redirect(target)
  }

  if (!orderId) return NextResponse.redirect(target)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('unauthorized')

  let provider: PayPalPaymentProvider
  try {
    provider = getPlatformBillingProvider('paypal') as PayPalPaymentProvider
  } catch (err) {
    console.error('[fees/paypal/capture] provider not configured:', err)
    return fail('capture_failed')
  }

  // Read first: the order's own custom_id names the tenant, and the caller must
  // administer it BEFORE we capture anything.
  let order: Awaited<ReturnType<PayPalPaymentProvider['getOrder']>>
  try {
    order = await provider.getOrder(orderId)
  } catch (err) {
    console.error('[fees/paypal/capture] order lookup failed:', err)
    return fail('capture_failed')
  }
  const tenantId = order.metadata?.tenant_id
  const paymentId = order.metadata?.payment_id
  if (order.metadata?.kind !== 'platform_fee' || !tenantId || !paymentId) {
    return fail('not_fee_order')
  }

  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  if (!membership || membership.role !== 'admin') return fail('forbidden')

  const admin = createAdminClient()

  let captured: {
    captureId?: string
    captureStatus?: string
    amount?: number
    currency?: string
  } = order

  if (!order.captureId) {
    // No money has moved yet, and it only moves if we capture. An order that
    // is already captured skips this: its settle path below stays idempotent.
    const { data: payment, error: paymentError } = await admin
      .from('platform_fee_payments')
      .select('status')
      .eq('payment_id', paymentId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (paymentError) {
      // Fail closed: capturing blind is the hazard. The return URL can be retried.
      console.error('[fees/paypal/capture] fee payment lookup failed:', paymentError.code, paymentError.message)
      return fail('capture_failed')
    }
    if (!payment) return fail('not_fee_order')
    if (payment.status === 'succeeded') {
      // Already credited some other way; a capture now would be a second charge.
      target.searchParams.set('fee_payment', paymentId)
      return NextResponse.redirect(target)
    }
    if (payment.status !== 'pending') {
      console.warn(`[fees/paypal/capture] order ${orderId} is for a ${payment.status} fee payment — not capturing`)
      return fail('payment_closed')
    }

    try {
      captured = await provider.captureOrder(orderId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('ORDER_ALREADY_CAPTURED')) {
        console.error('[fees/paypal/capture] capture failed:', err)
        return fail('capture_failed')
      }
      try {
        captured = await provider.getOrder(orderId)
      } catch (readErr) {
        console.error('[fees/paypal/capture] failed to read captured order:', readErr)
        return fail('capture_failed')
      }
    }
  }

  target.searchParams.set('fee_payment', paymentId)

  if (!captured.captureId) return fail('capture_failed')
  if (captured.captureStatus !== 'COMPLETED') {
    // PENDING / review: the PAYMENT.CAPTURE.COMPLETED webhook decides.
    console.warn(
      `[fees/paypal/capture] capture ${captured.captureId} is ${captured.captureStatus ?? 'unknown'} — leaving the fee payment pending`,
    )
    return NextResponse.redirect(target)
  }

  try {
    await dispatchPlatformBillingEvent(
      {
        type: 'payment.succeeded',
        providerEventId: `platform-paypal-capture:${captured.captureId}`,
        providerPaymentId: captured.captureId,
        reference: order.reference,
        metadata: order.metadata,
        amount: captured.amount,
        currency: captured.currency,
        raw: { source: 'paypal-fee-capture-route', orderId, captureId: captured.captureId },
      },
      { provider: 'paypal', admin },
    )
  } catch (err) {
    // Money is captured; the webhook retries the settlement.
    console.error('[fees/paypal/capture] dispatch failed (webhook will retry):', err)
  }

  return NextResponse.redirect(target)
}
