/**
 * On-chain confirmation for a school → platform Solana payment (#610).
 *
 * Solana has no signed webhook, so this is the platform twin of
 * `/api/payments/solana/verify`: the upgrade page polls it after showing the QR,
 * and a payment is proven by the chain rather than by a signature header. There
 * is no shared secret and none is needed — the only way to make this succeed is
 * a real transfer of the LOCKED amount to the platform wallet carrying this
 * request's unguessable reference.
 *
 * Confirmation is a two-step claim:
 *   1. write the signature onto the request (UNIQUE), which is what stops one
 *      settled transfer from buying two plan periods;
 *   2. hand a `subscription.activated` event to `dispatchPlatformBillingEvent`,
 *      the same function the Stripe/Binance webhooks dispatch through, so the
 *      subscription row, the tenant mirror, the revenue split and the period all
 *      come from one implementation.
 *
 * Deliberately NOT re-checking plan limits here, unlike `confirmManualPayment`:
 * by this point the school's money is on chain and irreversible, and refusing to
 * activate would take the payment without giving the plan. The pre-flight runs
 * at checkout, before the QR is ever shown.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { PublicKey } from '@solana/web3.js'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'
import {
  getPlatformSolanaConfig,
  resolveStoredSettlement,
  verifyPlatformTransfer,
} from '@/lib/billing/solana-platform-payment'
import { OPEN_REQUEST_STATUSES } from '@/lib/billing/payment-request-ttl'
import { paymentPollLimiter } from '@/lib/rate-limit'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase environment variables not set')
  return createAdminSupabase(url, serviceKey)
}

export async function POST(req: NextRequest) {
  try {
    const { requestId } = await req.json()
    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })
    }

    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await paymentPollLimiter.check(60, user.id)
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const { data: membership } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .single()

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only school admins can manage billing' }, { status: 403 })
    }

    const admin = getSupabaseAdmin()
    const { data: request } = await admin
      .from('platform_payment_requests')
      .select(
        // `request_type` is what makes `is_renewal` free here: it is already
        // classified at checkout by `recordSolanaPlatformRequest`, so the crypto
        // rails' "a second checkout IS a renewal" rule needs no extra query and
        // no guess. `amount`/`currency` are the USD figure the school owes,
        // which is the number to sum — never `settlement_base`.
        'request_id, tenant_id, plan_id, interval, status, payment_provider, provider_reference, request_type, amount, currency, settlement_currency, settlement_base, settlement_mint, platform_plans(slug)',
      )
      .eq('request_id', requestId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!request || request.payment_provider !== 'solana') {
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }
    // Idempotent under the page's own polling: the first poll to land the claim
    // activates, every later one reports the same answer.
    if (request.status === 'confirmed') {
      return NextResponse.json({ confirmed: true, alreadyProcessed: true })
    }
    if (!(OPEN_REQUEST_STATUSES as readonly string[]).includes(request.status)) {
      return NextResponse.json({ confirmed: false, status: request.status })
    }
    if (!request.provider_reference) {
      return NextResponse.json({ error: 'Payment request has no Solana reference' }, { status: 400 })
    }

    const config = getPlatformSolanaConfig()
    if (!config) {
      return NextResponse.json({ error: 'Solana is not configured' }, { status: 503 })
    }
    const settlement = resolveStoredSettlement(request)
    if (!settlement) {
      return NextResponse.json({ error: 'Payment request has no settlement amount' }, { status: 400 })
    }

    let signature: string | undefined
    try {
      const result = await verifyPlatformTransfer({
        config,
        reference: new PublicKey(request.provider_reference),
        settlement,
      })
      if (!result.confirmed) {
        // Nothing on chain yet — the page keeps polling.
        return NextResponse.json({ confirmed: false })
      }
      signature = result.signature
    } catch (err) {
      // A transaction WAS found and it did not pay what was owed. Never a
      // confirmation, and never silent.
      console.error(`[billing/solana/verify] on-chain validation failed for ${requestId}:`, err)
      return NextResponse.json({ error: 'On-chain validation failed' }, { status: 422 })
    }

    if (!signature) {
      return NextResponse.json({ error: 'On-chain validation failed' }, { status: 422 })
    }

    // Claim the payment. Status-gated so two concurrent polls cannot both
    // activate; UNIQUE on provider_charge_id so one signature cannot settle two
    // requests even if a reference were reused.
    const nowIso = new Date().toISOString()
    const { data: claimed, error: claimErr } = await admin
      .from('platform_payment_requests')
      .update({
        status: 'confirmed',
        provider_charge_id: signature,
        confirmed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('request_id', requestId)
      .in('status', OPEN_REQUEST_STATUSES as unknown as string[])
      .select('request_id')
      .maybeSingle()

    if (claimErr) {
      if ((claimErr as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'This on-chain payment was already used for another request' },
          { status: 409 },
        )
      }
      console.error(`[billing/solana/verify] failed to claim ${requestId}:`, claimErr)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }
    if (!claimed) {
      // A concurrent poll won the claim and is activating; report its outcome.
      return NextResponse.json({ confirmed: true, alreadyProcessed: true })
    }

    // PostgREST types an embedded one-to-one as an array; the FK makes it a
    // single row.
    const plan = request.platform_plans as unknown as { slug: string } | { slug: string }[] | null
    const planSlug = (Array.isArray(plan) ? plan[0] : plan)?.slug

    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.activated',
        providerEventId: signature,
        providerPaymentId: signature,
        // Solana has no subscription object; the settling signature stands in
        // as the provider-side id, exactly as the Binance order id does.
        providerSubscriptionId: signature,
        metadata: {
          tenant_id: request.tenant_id,
          plan_id: request.plan_id,
          ...(planSlug ? { plan_slug: planSlug } : {}),
          interval: request.interval,
        },
        raw: { requestId, signature },
      },
      { provider: 'solana', admin },
    )

    // Loop E. Downstream of the status-gated claim above, so the page's own
    // polling cannot emit this twice — only the poll that won the claim gets
    // here.
    //
    // `is_renewal` is the whole point on a crypto rail (#610): Solana has no
    // subscription object, so a second checkout on the same rail is a renewal
    // and counting it as a new sale would inflate platform growth.
    await track(
      ANALYTICS_EVENTS.PLATFORM_PAYMENT_SUCCEEDED,
      {
        provider: 'solana',
        amount: Number(request.amount ?? 0),
        interval: request.interval,
        is_renewal: request.request_type === 'renewal',
        currency: request.currency ?? 'usd',
        request_type: request.request_type ?? null,
        settlement_currency: request.settlement_currency ?? null,
        ...(planSlug ? { plan: planSlug } : {}),
        request_id: requestId,
      },
      // Attributed to the admin who completed the payment and, through
      // `tenantId`, to the school the money is actually for.
      { userId: user.id, tenantId: request.tenant_id, role: 'admin' },
    )

    console.log(`[billing/solana/verify] confirmed request ${requestId} (signature ${signature})`)
    return NextResponse.json({ confirmed: true, signature })
  } catch (error) {
    console.error('[billing/solana/verify] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
