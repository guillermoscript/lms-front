/**
 * Provision an isolated one-hour native Solana subscription for local UI testing.
 *
 * The deployed program only supports whole-hour periods. This creates a $0.01
 * Devnet plan for the default test school, links course 1002, and creates its
 * matching on-chain plan. It refuses mainnet, checks the test student has no
 * live subscription, and never modifies existing plans/subscriptions.
 *
 * Usage: npx tsx scripts/devnet-setup-one-hour-renewal.ts
 */

import { Keypair } from '@solana/web3.js'
import { getBase58Encoder } from '@solana/kit'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { ensurePlanOnChain } from '../lib/payments/solana-subscriptions'

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1]] ??= match[2].trim().replace(/^['"]|['"]$/g, '')
}

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} in .env.local`)
  return value
}

const rpcUrl = required('SOLANA_RPC_URL')
if (!/devnet/i.test(rpcUrl)) throw new Error(`Refusing non-Devnet RPC: ${new URL(rpcUrl).host}`)

const tenantId = '00000000-0000-0000-0000-000000000001'
const courseId = 1002
const studentEmail = 'student@e2etest.com'
const price = 0.01
const periodHours = 1
const planName = `Devnet Auto-Renew Test (${new Date().toISOString()})`

const admin = createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({ perPage: 200 })
  if (authError) throw authError
  const student = authData.users.find((user) => user.email === studentEmail)
  if (!student) throw new Error(`Local test account ${studentEmail} does not exist`)

  const { data: membership, error: membershipError } = await admin
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', student.id)
    .eq('status', 'active')
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) throw new Error(`${studentEmail} is not an active member of the default test school`)

  const { data: liveSub, error: liveSubError } = await admin
    .from('subscriptions')
    .select('subscription_id, plan_id, subscription_status')
    .eq('user_id', student.id)
    .eq('tenant_id', tenantId)
    .in('subscription_status', ['active', 'past_due', 'renewed'])
    .limit(1)
    .maybeSingle()
  if (liveSubError) throw liveSubError
  if (liveSub) throw new Error(`${studentEmail} already has a live subscription; refusing to create a parallel test charge`)

  const [{ data: course, error: courseError }, { data: schoolWallet, error: walletError }] = await Promise.all([
    admin.from('courses').select('course_id').eq('course_id', courseId).eq('tenant_id', tenantId).maybeSingle(),
    admin.from('tenant_payment_wallets').select('wallet_address').eq('tenant_id', tenantId).eq('provider', 'solana_subs').maybeSingle(),
  ])
  if (courseError) throw courseError
  if (walletError) throw walletError
  if (!course) throw new Error(`Course ${courseId} was not found in the default test school`)
  if (!schoolWallet?.wallet_address) throw new Error('The default test school has no solana_subs receiving wallet')

  const platformWallet = required('SOLANA_PLATFORM_WALLET')
  const mint = required('SOLANA_USDC_MINT')
  const pullerSecret = required('SOLANA_PULLER_SECRET_KEY')
  const merchant = Keypair.fromSecretKey(new Uint8Array(getBase58Encoder().encode(pullerSecret))).publicKey.toBase58()

  let planId = Math.floor(Date.now() / 1000)
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data: occupied, error } = await admin.from('plans').select('plan_id').eq('plan_id', planId).maybeSingle()
    if (error) throw error
    if (!occupied) break
    planId++
  }

  const { data: plan, error: planError } = await admin
    .from('plans')
    .insert({
      plan_id: planId,
      plan_name: planName,
      description: 'Devnet-only test: $0.01 USDC auto-pull, recurring every hour. No real funds.',
      features: 'One-hour renewal test on Solana Devnet',
      price,
      duration_in_days: 1,
      solana_period_hours: periodHours,
      currency: 'usd',
      payment_provider: 'solana_subs',
      tenant_id: tenantId,
    })
    .select('plan_id')
    .single()
  if (planError) throw planError

  try {
    const { error: linkError } = await admin.from('plan_courses').insert({ plan_id: plan.plan_id, course_id: courseId })
    if (linkError) throw linkError

    const result = await ensurePlanOnChain({
      rpcUrl,
      pullerSecretKeyBase58: pullerSecret,
      planId: BigInt(plan.plan_id),
      mint,
      amountBase: 10_000n,
      periodHours: BigInt(periodHours),
      destinations: [schoolWallet.wallet_address, platformWallet],
      pullers: [merchant],
      metadataUri: 'Devnet one-hour LMS renewal test',
    })
    if (!result.created) {
      throw new Error(`On-chain plan id ${plan.plan_id} already exists; refusing to reuse unknown plan terms`)
    }

    console.log(JSON.stringify({
      status: 'ready',
      planId: plan.plan_id,
      planName,
      priceUsdc: price,
      periodHours,
      studentEmail,
      courseId,
      merchant: result.merchant,
      planPda: result.planPda,
      createdOnChain: true,
      checkoutUrl: `http://lvh.me:3000/en/checkout?planId=${plan.plan_id}`,
    }, null, 2))
  } catch (error) {
    // Keep the sequence id reserved; soft-delete the incomplete plan so the UI
    // cannot offer a plan whose on-chain setup failed.
    await admin.from('plans').update({ deleted_at: new Date().toISOString() }).eq('plan_id', plan.plan_id)
    throw error
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
