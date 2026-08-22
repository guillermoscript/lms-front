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
 * Confirmation is a durable two-stage workflow:
 *   1. atomically observe the signature (UNIQUE), which stops one settled
 *      transfer from buying two plan periods;
 *   2. lease replay-safe entitlement activation. A failed or crashed worker is
 *      retried here or by the reconciliation cron until the request is activated.
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
import {
  observeSolanaPlatformPayment,
  processSolanaPlatformActivation,
} from '@/lib/billing/solana-platform-activation'
import {
  getPlatformSolanaConfig,
  resolveStoredSettlement,
  verifyPlatformTransfer,
} from '@/lib/billing/solana-platform-payment'
import { OPEN_REQUEST_STATUSES } from '@/lib/billing/payment-request-ttl'
import { paymentPollLimiter } from '@/lib/rate-limit'

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
        'request_id, tenant_id, plan_id, interval, status, payment_provider, provider_reference, provider_charge_id, settlement_currency, settlement_base, settlement_mint, switch_id, activation_state, activation_attempt_count, platform_plans(slug)',
      )
      .eq('request_id', requestId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!request || request.payment_provider !== 'solana') {
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }
    if (request.activation_state === 'activated' || request.status === 'confirmed') {
      return NextResponse.json({
        confirmed: true,
        state: 'activated',
        signature: request.provider_charge_id,
        alreadyProcessed: true,
      })
    }
    if (
      request.activation_state === 'terminal_invalid' ||
      request.status === 'rejected' ||
      request.status === 'expired'
    ) {
      return NextResponse.json({ confirmed: false, state: 'terminal_invalid' })
    }

    // Once a signature is durable, never depend on the chain lookup again.
    // Retry the leased, idempotent activation directly.
    if (request.provider_charge_id) {
      const activation = await processSolanaPlatformActivation(admin, requestId)
      return NextResponse.json({
        confirmed: activation.state === 'activated',
        state: activation.state,
        signature: request.provider_charge_id,
        attemptCount: activation.attemptCount,
        ...(activation.state === 'activated' && !activation.claimed
          ? { alreadyProcessed: true }
          : {}),
        ...(activation.alertRequired ? { alertRequired: true } : {}),
      })
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
      return NextResponse.json(
        { error: 'On-chain validation failed', confirmed: false, state: 'terminal_invalid' },
        { status: 422 },
      )
    }

    if (!signature) {
      return NextResponse.json({ error: 'On-chain validation failed' }, { status: 422 })
    }

    const observed = await observeSolanaPlatformPayment(admin, requestId, tenantId, signature)
    if (observed.status === 'signature_conflict') {
      return NextResponse.json(
        {
          error: 'This on-chain payment was already used for another request',
          confirmed: false,
          state: 'terminal_invalid',
        },
        { status: 409 },
      )
    }
    if (observed.status === 'signature_mismatch') {
      return NextResponse.json(
        { error: 'Payment request has a different signature', confirmed: false, state: 'terminal_invalid' },
        { status: 409 },
      )
    }
    if (observed.status === 'not_found') {
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }
    if (observed.status === 'terminal_invalid') {
      return NextResponse.json({ confirmed: false, state: 'terminal_invalid' })
    }
    if (observed.status === 'activated') {
      return NextResponse.json({
        confirmed: true,
        state: 'activated',
        signature: observed.signature,
        alreadyProcessed: true,
      })
    }

    const activation = await processSolanaPlatformActivation(admin, requestId)
    if (activation.state === 'activated') {
      console.log(`[billing/solana/verify] activated request ${requestId} (signature ${signature})`)
    }
    return NextResponse.json({
      confirmed: activation.state === 'activated',
      state: activation.state,
      signature,
      attemptCount: activation.attemptCount,
      ...(activation.alertRequired ? { alertRequired: true } : {}),
    })
  } catch (error) {
    console.error('[billing/solana/verify] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
