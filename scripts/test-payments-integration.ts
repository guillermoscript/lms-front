/**
 * DB-level integration test for the provider-agnostic payments money-path
 * (issue #280) — the parts that are network-free and trigger/RPC-driven.
 *
 * The on-chain legs (findReference, getSubscriptionState, the two-leg split
 * pull) need devnet/mainnet and are covered structurally by
 * test-solana-subscriptions.ts (LiteSVM) + test-solana-split.ts. THIS test
 * exercises what those cannot: the Postgres trigger + RPC chain that turns a
 * confirmed transaction into a subscription + entitlements, and the
 * capability-aware expiry gating.
 *
 *   A. solana_subs activation — a confirmed (status='successful') native-subs
 *      transaction fires after_transaction_update → handle_new_subscription,
 *      which CREATES the subscription copying payment_provider +
 *      provider_subscription_id (the on-chain delegation PDA) off the tx, and
 *      grants one entitlement per plan course. (mirrors /verify's flip)
 *   B. crank renewal — extend_subscription_period(PDA, 'solana_subs', newEnd)
 *      advances current_period_end + the entitlements' expires_at. (mirrors the
 *      /api/cron/solana-pull extend after a successful on-chain pull)
 *   C. cancel — status → 'canceled' fires handle_subscription_status_change,
 *      which revokes the linked entitlements.
 *   D. capability-aware expiry — PROVIDER_CAPABILITIES drives which providers
 *      the expire-subscriptions cron may expire. solana_subs + the push-renewal
 *      providers MUST be excluded; one-time solana / manual / NULL included.
 *
 * Run: npx tsx scripts/test-payments-integration.ts   (needs local Supabase up)
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '../lib/payments/types'

const env = readFileSync('.env.local', 'utf8')
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')!
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const PLAN = 99001
const TENANT = '00000000-0000-0000-0000-000000000002'
const USER = 'a1000000-0000-0000-0000-000000000004' // alice (Code Academy)
// A plausible (but fake) on-chain SubscriptionDelegation PDA — base58, 44 chars.
const FAKE_PDA = 'So1aSubzPdaTestkey1111111111111111111111111'

let failures = 0
function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.log('  ✗', msg)
    failures++
  } else {
    console.log('  ✓', msg)
  }
}

// Same dedicated test plan + course links as test-lemonsqueezy-pipeline.ts so
// this test is reproducible on a fresh `supabase db reset`.
async function ensureFixture() {
  await admin.from('plans').upsert({
    plan_id: PLAN,
    plan_name: 'Native Subs Test Monthly',
    price: 19.99,
    duration_in_days: 30,
    description: 'Payments integration test plan.',
    features: ['Unlimited course access'],
    currency: 'usd',
    payment_provider: 'solana_subs',
    tenant_id: TENANT,
  }, { onConflict: 'plan_id' })
  await admin.from('plan_courses').upsert([
    { plan_id: PLAN, course_id: 2001 },
    { plan_id: PLAN, course_id: 2002 },
  ], { onConflict: 'plan_id,course_id' })
}

// Scoped to THIS test's plan only. A broad `source_type='subscription'` delete
// would wipe alice's OTHER seeded subscription entitlements (her plan-2001 sub)
// and silently corrupt shared seed data for later tests / UI sessions.
async function cleanup() {
  const { data: subs } = await admin
    .from('subscriptions').select('subscription_id')
    .eq('user_id', USER).eq('plan_id', PLAN)
  const subIds = (subs ?? []).map(s => s.subscription_id)
  if (subIds.length) {
    await admin.from('entitlements').delete()
      .eq('user_id', USER).eq('source_type', 'subscription').in('source_id', subIds)
  }
  await admin.from('subscriptions').delete().eq('user_id', USER).eq('plan_id', PLAN)
  await admin.from('transactions').delete().eq('user_id', USER).eq('plan_id', PLAN)
}

async function main() {
  await ensureFixture()
  await cleanup()

  // ---------------------------------------------------------------------
  // A. solana_subs activation: confirmed tx → subscription + entitlements.
  // ---------------------------------------------------------------------
  console.log('\nA. solana_subs activation (trigger creates subscription)')
  const { data: tx, error: txErr } = await admin
    .from('transactions')
    .insert({
      user_id: USER, tenant_id: TENANT, plan_id: PLAN,
      amount: 19.99, currency: 'usd', status: 'pending',
      payment_provider: 'solana_subs', provider_subscription_id: FAKE_PDA,
    })
    .select('transaction_id')
    .single()
  if (txErr) throw txErr
  const txId = tx.transaction_id as number

  // /verify flips status='pending' → 'successful' (provider_subscription_id is
  // already the PDA at this point). The after_transaction_update trigger fires
  // handle_new_subscription.
  const { error: flipErr } = await admin
    .from('transactions')
    .update({ status: 'successful' })
    .eq('transaction_id', txId)
    .eq('status', 'pending')
  if (flipErr) throw flipErr

  const { data: sub } = await admin
    .from('subscriptions')
    .select('subscription_id, subscription_status, payment_provider, provider_subscription_id, current_period_end, end_date')
    .eq('user_id', USER).eq('plan_id', PLAN).maybeSingle()
  assert(sub, 'subscription row created by trigger')
  assert(sub!.payment_provider === 'solana_subs', `sub.payment_provider = solana_subs (got ${sub?.payment_provider})`)
  assert(sub!.provider_subscription_id === FAKE_PDA, 'sub.provider_subscription_id = on-chain PDA (copied from tx)')
  assert(sub!.subscription_status === 'active', 'sub status active')

  const { data: ents } = await admin
    .from('entitlements').select('course_id, status, expires_at')
    .eq('user_id', USER).eq('source_type', 'subscription').eq('source_id', sub!.subscription_id)
  assert((ents?.length ?? 0) === 2, `entitlements granted for both plan courses (got ${ents?.length})`)
  assert(ents!.every(e => e.status === 'active'), 'entitlements active')
  const initialExpiry = ents?.[0]?.expires_at ? new Date(ents[0].expires_at).getTime() : 0

  // ---------------------------------------------------------------------
  // B. crank renewal: extend_subscription_period advances period + access.
  // ---------------------------------------------------------------------
  console.log('\nB. crank renewal (extend_subscription_period by PDA)')
  const newEnd = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString()
  const { error: extErr } = await admin.rpc('extend_subscription_period', {
    _provider_subscription_id: FAKE_PDA,
    _provider: 'solana_subs',
    _new_period_end: newEnd,
  })
  assert(!extErr, `extend_subscription_period ran without error${extErr ? ` (${extErr.message})` : ''}`)
  const { data: subExt } = await admin
    .from('subscriptions').select('current_period_end, end_date')
    .eq('user_id', USER).eq('plan_id', PLAN).single()
  assert(
    Math.abs(new Date(subExt!.current_period_end).getTime() - new Date(newEnd).getTime()) < 2000,
    'current_period_end advanced to the new period end',
  )
  const { data: entsExt } = await admin
    .from('entitlements').select('expires_at')
    .eq('user_id', USER).eq('source_type', 'subscription').eq('source_id', sub!.subscription_id)
  const extendedExpiry = entsExt?.[0]?.expires_at ? new Date(entsExt[0].expires_at).getTime() : 0
  assert(extendedExpiry > initialExpiry, 'entitlements expires_at extended with the period')

  // ---------------------------------------------------------------------
  // C. cancel: status → canceled revokes the linked entitlements.
  // ---------------------------------------------------------------------
  console.log('\nC. cancel (status change revokes access)')
  const { error: cancelErr } = await admin
    .from('subscriptions').update({ subscription_status: 'canceled' })
    .eq('subscription_id', sub!.subscription_id)
  assert(!cancelErr, 'subscription canceled')
  const { data: entsCancelled } = await admin
    .from('entitlements').select('status, revoked_at')
    .eq('user_id', USER).eq('source_type', 'subscription').eq('source_id', sub!.subscription_id)
  assert(
    (entsCancelled?.length ?? 0) > 0 && entsCancelled!.every(e => e.status !== 'active'),
    'entitlements revoked on cancel (trigger handle_subscription_status_change)',
  )

  // ---------------------------------------------------------------------
  // D. capability-aware expiry gating (PROVIDER_CAPABILITIES is the source of
  //    truth the expire-subscriptions cron gates on). Re-derive the route's
  //    rule and assert the data drives the right decision per provider.
  // ---------------------------------------------------------------------
  console.log('\nD. capability-aware expiry gating')
  const isCronExpirable = (p: PaymentProvider) => {
    const c = PROVIDER_CAPABILITIES[p]
    return !(c.emitsRenewalWebhooks || c.supportsNativeSubscriptions)
  }
  // MUST NOT be cron-expired (a renewal mechanism owns their lifecycle):
  assert(!isCronExpirable('solana_subs'), 'solana_subs excluded (crank renews it)')
  assert(!isCronExpirable('lemonsqueezy'), 'lemonsqueezy excluded (renewal webhook)')
  assert(!isCronExpirable('stripe'), 'stripe excluded (renewal webhook)')
  assert(!isCronExpirable('paypal'), 'paypal excluded (renewal webhook)')
  // MUST be cron-expired (self-managed period, no auto-renewal):
  assert(isCronExpirable('solana'), 'solana (one-time) IS cron-expirable')
  assert(isCronExpirable('manual'), 'manual IS cron-expirable')

  await cleanup()

  console.log(`\n${failures === 0 ? '✅ Payments integration test PASSED' : `❌ ${failures} assertion(s) FAILED`}`)
  if (failures) process.exit(1)
}

main().catch(async (e) => {
  console.error('\n❌ TEST ERROR:', e)
  await cleanup()
  process.exit(1)
})
