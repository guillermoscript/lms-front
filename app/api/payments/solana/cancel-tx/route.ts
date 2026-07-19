/**
 * Build the UNSIGNED cancel transaction for a student's own native Solana
 * subscription (issue #460).
 *
 * Revoking the on-chain auto-pull delegation requires the SUBSCRIBER's wallet
 * signature — the server cannot do it (it holds only the puller key). So this
 * route builds the unsigned `cancel` transaction for the caller's OWN
 * subscription and returns it; the wallet signs it and submits it through the
 * existing /api/payments/solana/submit relay (the Subscriptions program is
 * allowlisted there). Confirmation + DB finalize happen in /cancel-verify.
 *
 * Auth: the caller must be signed in AND own the subscription. We resolve the
 * row through the RLS server client filtered by the caller's user_id, so a user
 * can only ever build a cancel tx for their own delegation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCancelTxUnsignedBase64 } from '@/lib/payments/solana-subscriptions'
import { paymentAuthLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'

interface SolanaSubMeta {
  subscriber?: string
  merchant?: string
  planId?: string
  mint?: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await paymentAuthLimiter.check(10, user.id)
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    const subscriptionId = body?.subscriptionId
    if (!subscriptionId || typeof subscriptionId !== 'number') {
      return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })
    }

    // RLS + explicit user filter: the caller can only reach their own row.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('subscription_id, payment_provider, provider_metadata, subscription_status')
      .eq('subscription_id', subscriptionId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }
    if (sub.payment_provider !== 'solana_subs') {
      return NextResponse.json({ error: 'Not a Solana subscription' }, { status: 400 })
    }

    const meta = (sub.provider_metadata ?? {}) as SolanaSubMeta
    if (!meta.subscriber || !meta.merchant || !meta.planId) {
      return NextResponse.json(
        { error: 'Subscription is missing its on-chain coordinates' },
        { status: 400 },
      )
    }

    const rpcUrl = process.env.SOLANA_RPC_URL
    if (!rpcUrl) {
      return NextResponse.json({ error: 'Solana not configured' }, { status: 503 })
    }

    const transaction = await buildCancelTxUnsignedBase64({
      rpcUrl,
      subscriber: meta.subscriber,
      merchant: meta.merchant,
      planId: BigInt(meta.planId),
    })

    return NextResponse.json({ transaction })
  } catch (error) {
    console.error('[solana/cancel-tx] error:', error)
    const message = error instanceof Error ? error.message : 'Failed to build cancel transaction'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
