/**
 * PayPal order-capture return route.
 *
 * Orders v2 does NOT auto-capture: after the buyer approves on PayPal, they are
 * redirected here (`?token=<orderId>&next=<final success URL>`) and we capture
 * the approved order server-side, dispatch `payment.succeeded` through the
 * shared billing dispatcher (flips the pending transaction → `enroll_user`),
 * and redirect on to the checkout success page.
 *
 * Security notes:
 * - No session requirement: like a webhook, authority comes from the capture
 *   API call itself (only an approved order capturable with OUR credentials
 *   succeeds) plus the owner-binding custom_id metadata enforced by
 *   dispatchBillingEvent — never from the redirect query string.
 * - `next` is only followed when it targets this request's own origin
 *   (open-redirect guard); anything else falls back to /checkout/success.
 * - Refresh/replay safe: an already-captured order (ORDER_ALREADY_CAPTURED) is
 *   re-read via getOrder and re-dispatched — the dispatcher's pending-status
 *   guard makes that a no-op. The PAYMENT.CAPTURE.COMPLETED webhook backstops a
 *   capture made here whose dispatch failed; an order the buyer abandons after
 *   approval is never captured and simply expires at PayPal.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPaymentProvider } from '@/lib/payments'
import { PayPalPaymentProvider } from '@/lib/payments/paypal-provider'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase environment variables not set')
  }
  return createClient(url, serviceKey)
}

/**
 * Resolve this request's own origin (tenant subdomain aware, like checkout).
 *
 * req.nextUrl.origin does NOT reflect the incoming Host header in dev — it
 * resolves to the Next.js dev server's own bind address regardless of which
 * tenant subdomain the request came in on (confirmed live via #479). Trust
 * the Host header instead, same pattern as app/api/stripe/connect/route.ts.
 */
function requestOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  return `${proto}://${host}`
}

/** Follow `next` only when it points back at our own origin. */
function safeRedirectTarget(next: string | null, origin: string, fallback: string): string {
  if (!next) return fallback
  try {
    const url = new URL(next, origin)
    if (url.origin === origin) return url.toString()
  } catch {
    // fall through to fallback
  }
  return fallback
}

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('token') // PayPal appends ?token=<orderId>
  const next = req.nextUrl.searchParams.get('next')
  const origin = requestOrigin(req)
  const fallback = `${origin}/checkout/success`

  if (!orderId) {
    return NextResponse.redirect(safeRedirectTarget(next, origin, fallback))
  }

  let provider: PayPalPaymentProvider
  try {
    provider = getPaymentProvider('paypal') as PayPalPaymentProvider
  } catch (err) {
    console.error('[paypal/capture] provider not configured:', err)
    return NextResponse.redirect(safeRedirectTarget(next, origin, fallback))
  }

  let captureId: string | undefined
  let reference: string | undefined
  let metadata: Record<string, string> | undefined

  try {
    const captured = await provider.captureOrder(orderId)
    captureId = captured.captureId
    reference = captured.reference
    metadata = captured.metadata
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('ORDER_ALREADY_CAPTURED')) {
      // Refresh / duplicate return: read the existing capture and fall through
      // to the (idempotent) dispatch below.
      try {
        const order = await provider.getOrder(orderId)
        captureId = order.captureId
        reference = order.reference
        metadata = order.metadata
      } catch (readErr) {
        console.error('[paypal/capture] failed to read already-captured order:', readErr)
      }
    } else {
      console.error('[paypal/capture] capture failed:', err)
      const target = new URL(safeRedirectTarget(next, origin, fallback))
      target.searchParams.set('paypal', 'capture_failed')
      return NextResponse.redirect(target)
    }
  }

  if (captureId && reference) {
    try {
      await dispatchBillingEvent(
        {
          type: 'payment.succeeded',
          providerEventId: `paypal-capture:${captureId}`,
          providerPaymentId: captureId,
          reference,
          metadata,
          raw: { source: 'paypal-capture-route', orderId, captureId },
        },
        { provider: 'paypal', admin: getSupabaseAdmin() },
      )
    } catch (err) {
      // Payment IS captured — never strand the buyer on an error page for a
      // dispatch hiccup; the PAYMENT.CAPTURE.COMPLETED webhook retries the flip.
      console.error('[paypal/capture] dispatch failed (webhook will retry):', err)
    }
  }

  return NextResponse.redirect(safeRedirectTarget(next, origin, fallback))
}
