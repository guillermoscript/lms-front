/**
 * Local-only wallet simulator for the manual Devnet subscription checkout test.
 * Signs with a disposable test key stored outside the repository; production
 * builds and non-Devnet RPCs are refused before any key is read.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import { getBase58Encoder } from '@solana/kit'
import { readFileSync } from 'node:fs'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import {
  buildInitAuthorityTxUnsignedBase64,
  buildSubscribeTxUnsignedBase64,
  ensurePlanOnChain,
} from '@/lib/payments/solana-subscriptions'

export const runtime = 'nodejs'

const TEST_STUDENT_EMAIL = 'student@e2etest.com'
const EXPECTED_TEST_WALLET = 'FmJvMsNXi8xcXAh7qDwToEhijT9my4bkQKDtMUwZpHRj'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables not set')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const rpcUrl = process.env.SOLANA_RPC_URL
  if (!rpcUrl || !/devnet/i.test(new URL(rpcUrl).host)) {
    return NextResponse.json({ error: 'Wallet simulation is restricted to Solana Devnet' }, { status: 403 })
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const tenantId = await getCurrentTenantId()
    if (!user || user.email !== TEST_STUDENT_EMAIL) {
      return NextResponse.json({ error: 'Sign in as the local Devnet test student to use the simulator' }, { status: 403 })
    }

    const { transactionId } = await req.json() as { transactionId?: number }
    if (!Number.isSafeInteger(transactionId) || !transactionId) {
      return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 })
    }

    const admin = getAdmin()
    const { data: tx, error: txError } = await admin
      .from('transactions')
      .select('transaction_id, status, amount, tenant_id, plan_id, payment_provider, provider_subscription_id, user_id')
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (txError) throw txError
    if (!tx || tx.status !== 'pending' || tx.payment_provider !== 'solana_subs' || !tx.plan_id || !tx.provider_subscription_id) {
      return NextResponse.json({ error: 'No payable Devnet subscription checkout was found' }, { status: 409 })
    }

    const { data: plan, error: planError } = await admin
      .from('plans')
      .select('plan_name, price, duration_in_days, solana_period_hours')
      .eq('plan_id', tx.plan_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (planError) throw planError
    if (
      !plan?.plan_name.startsWith('Devnet Auto-Renew Test (') ||
      Number(plan.price) !== 0.01 ||
      plan.solana_period_hours !== 1 ||
      Number(tx.amount) !== 0.01
    ) {
      return NextResponse.json({ error: 'The simulator only accepts the isolated $0.01 one-hour test plan' }, { status: 403 })
    }

    const keyPath = process.env.SOLANA_DEVNET_TEST_SUBSCRIBER_KEYPAIR_PATH
    if (!keyPath) return NextResponse.json({ error: 'Set the local Devnet test wallet key path to enable simulation' }, { status: 503 })
    const subscriber = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, 'utf8')) as number[]))
    if (subscriber.publicKey.toBase58() !== EXPECTED_TEST_WALLET) {
      return NextResponse.json({ error: 'Configured key is not the approved disposable Devnet test wallet' }, { status: 403 })
    }

    const pullerSecret = process.env.SOLANA_PULLER_SECRET_KEY
    const mint = process.env.SOLANA_USDC_MINT
    const platformWallet = process.env.SOLANA_PLATFORM_WALLET
    if (!pullerSecret || !mint || !platformWallet) {
      return NextResponse.json({ error: 'Solana subscriptions are not configured' }, { status: 503 })
    }
    const { data: schoolWallet, error: walletError } = await admin
      .from('tenant_payment_wallets')
      .select('wallet_address')
      .eq('tenant_id', tenantId)
      .eq('provider', 'solana_subs')
      .maybeSingle()
    if (walletError) throw walletError
    if (!schoolWallet?.wallet_address) return NextResponse.json({ error: 'School Solana wallet is not configured' }, { status: 400 })

    await admin
      .from('transactions')
      .update({ provider_metadata: { subscriber: subscriber.publicKey.toBase58() } })
      .eq('transaction_id', transactionId)
      .eq('status', 'pending')
      .is('provider_metadata', null)

    const connection = new Connection(rpcUrl, 'confirmed')
    let initSignature: string | null = null
    const initBase64 = await buildInitAuthorityTxUnsignedBase64({
      rpcUrl,
      subscriber: subscriber.publicKey.toBase58(),
      mint,
    })
    if (initBase64) {
      const initTx = VersionedTransaction.deserialize(Buffer.from(initBase64, 'base64'))
      initTx.sign([subscriber])
      initSignature = await connection.sendRawTransaction(initTx.serialize())
      await connection.confirmTransaction(initSignature, 'confirmed')
    }

    const merchant = Keypair.fromSecretKey(new Uint8Array(getBase58Encoder().encode(pullerSecret))).publicKey.toBase58()
    await ensurePlanOnChain({
      rpcUrl,
      pullerSecretKeyBase58: pullerSecret,
      planId: BigInt(tx.plan_id),
      mint,
      amountBase: BigInt(10_000),
      periodHours: BigInt(plan.solana_period_hours),
      destinations: [schoolWallet.wallet_address, platformWallet],
      pullers: [merchant],
      metadataUri: 'Devnet one-hour LMS renewal test',
    })

    const subscribeBase64 = await buildSubscribeTxUnsignedBase64({
      rpcUrl,
      subscriber: subscriber.publicKey.toBase58(),
      merchant,
      planId: BigInt(tx.plan_id),
      mint,
      reference: tx.provider_subscription_id,
    })
    const subscribeTx = VersionedTransaction.deserialize(Buffer.from(subscribeBase64, 'base64'))
    subscribeTx.sign([subscriber])
    const subscribeSignature = await connection.sendRawTransaction(subscribeTx.serialize())
    await connection.confirmTransaction(subscribeSignature, 'confirmed')

    return NextResponse.json({
      submitted: true,
      subscriber: subscriber.publicKey.toBase58(),
      subscribeSignature,
      initSignature,
    })
  } catch (error) {
    console.error('[solana/devnet-simulate-subscription]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Wallet simulation failed' }, { status: 500 })
  }
}
