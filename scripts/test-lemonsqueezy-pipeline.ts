/**
 * Local money-path test for the Lemon Squeezy adapter + dispatcher (Phase 4).
 *
 * Exercises everything except LS's own servers:
 *   - verifyWebhook: HMAC-SHA256 of the raw body vs X-Signature (valid + tampered)
 *   - normalizeWebhookEvent: subscription_created → subscription.activated mapping
 *   - dispatchBillingEvent: pending tx → flip successful → after_transaction_update
 *     trigger → handle_new_subscription creates the subscription row + entitlements
 *     + extend_subscription_period aligns current_period_end to renews_at
 *   - idempotency: a second dispatch does not duplicate or error
 *
 * Run: npx tsx scripts/test-lemonsqueezy-pipeline.ts
 */
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load local Supabase creds from .env.local.
const env = readFileSync('.env.local', 'utf8')
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')!
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY')!
const SECRET = 'test_ls_secret'
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET

import { LemonSqueezyProvider } from '../lib/payments/lemonsqueezy-provider'
import { dispatchBillingEvent } from '../lib/payments/webhook-dispatch'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)
const PLAN = 99001
const TENANT = '00000000-0000-0000-0000-000000000002'
const USER = 'a1000000-0000-0000-0000-000000000004' // alice (Code Academy)
const LS_SUB_ID = 'ls_sub_TEST123'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log('  ✓', msg)
}

// Scoped to THIS test's plan only — a broad `source_type='subscription'` delete
// would wipe alice's OTHER seeded subscription entitlements (her plan-2001 sub)
// and silently corrupt shared seed data for later tests / UI sessions.
async function cleanup(txId?: number) {
  const { data: subs } = await admin
    .from('subscriptions').select('subscription_id')
    .eq('user_id', USER).eq('plan_id', PLAN)
  const subIds = (subs ?? []).map(s => s.subscription_id)
  if (subIds.length) {
    await admin.from('entitlements').delete()
      .eq('user_id', USER).eq('source_type', 'subscription').in('source_id', subIds)
  }
  await admin.from('subscriptions').delete().eq('user_id', USER).eq('plan_id', PLAN)
  if (txId) await admin.from('transactions').delete().eq('transaction_id', txId)
  else await admin.from('transactions').delete().eq('user_id', USER).eq('plan_id', PLAN)
}

// Dedicated LS test plan for Code Academy (tenant ...002), linked to the same
// two seeded courses as plan 2001. Self-provisioned so the test is reproducible
// on a fresh `supabase db reset` (does not depend on a manual insert).
async function ensureFixture() {
  await admin.from('plans').upsert({
    plan_id: PLAN,
    plan_name: 'LS Test Monthly',
    price: 19.99,
    duration_in_days: 30,
    description: 'Lemon Squeezy pipeline test plan.',
    features: ['Unlimited course access'],
    currency: 'usd',
    payment_provider: 'lemonsqueezy',
    tenant_id: TENANT,
  }, { onConflict: 'plan_id' })
  await admin.from('plan_courses').upsert([
    { plan_id: PLAN, course_id: 2001 },
    { plan_id: PLAN, course_id: 2002 },
  ], { onConflict: 'plan_id,course_id' })
}

async function main() {
  await ensureFixture()
  await cleanup()

  // 1. Insert a pending LS transaction (status pending → trigger is a no-op).
  const { data: tx, error: txErr } = await admin
    .from('transactions')
    .insert({
      user_id: USER, tenant_id: TENANT, plan_id: PLAN,
      amount: 19.99, currency: 'usd', status: 'pending', payment_provider: 'lemonsqueezy',
    })
    .select('transaction_id')
    .single()
  if (txErr) throw txErr
  const txId = tx.transaction_id as number
  console.log(`\n1. pending tx ${txId} created`)

  // 2. Synthetic LS subscription_created payload (reference = our tx id).
  const renewsAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
  const payload = {
    meta: { event_name: 'subscription_created', custom_data: { reference: String(txId) } },
    data: { id: LS_SUB_ID, type: 'subscriptions', attributes: { status: 'active', renews_at: renewsAt, updated_at: '2026-06-15T10:00:00.000000Z' } },
  }
  const rawBody = JSON.stringify(payload)
  const sig = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex')

  const provider = new LemonSqueezyProvider('test_key', 'test_store', SECRET)

  // 3. verifyWebhook — valid + tampered.
  console.log('\n2. verifyWebhook')
  assert(await provider.verifyWebhook(rawBody, { 'x-signature': sig }), 'valid signature accepted')
  assert(!(await provider.verifyWebhook(rawBody, { 'x-signature': sig.replace(/.$/, '0') })), 'tampered signature rejected')
  assert(!(await provider.verifyWebhook(rawBody, {})), 'missing signature rejected')

  // 4. normalizeWebhookEvent.
  console.log('\n3. normalizeWebhookEvent')
  const event = await provider.normalizeWebhookEvent(rawBody)
  assert(event?.type === 'subscription.activated', `type = subscription.activated (got ${event?.type})`)
  assert(event?.reference === String(txId), 'reference round-tripped from custom_data')
  assert(event?.providerSubscriptionId === LS_SUB_ID, 'providerSubscriptionId = LS sub id')
  assert(event?.providerEventId && event.providerEventId.includes(LS_SUB_ID), 'providerEventId synthesized')
  assert(event?.periodEnd instanceof Date, 'periodEnd parsed from renews_at')

  // 5. dispatchBillingEvent → flip tx + create subscription + entitlements.
  console.log('\n4. dispatchBillingEvent (activation)')
  await dispatchBillingEvent(event!, { provider: 'lemonsqueezy', admin })

  const { data: txAfter } = await admin.from('transactions').select('status').eq('transaction_id', txId).single()
  assert(txAfter?.status === 'successful', `tx flipped to successful (got ${txAfter?.status})`)

  const { data: sub } = await admin
    .from('subscriptions')
    .select('subscription_id, subscription_status, payment_provider, provider_subscription_id, current_period_end, end_date')
    .eq('user_id', USER).eq('plan_id', PLAN).maybeSingle()
  assert(sub, 'subscription row created')
  assert(sub!.payment_provider === 'lemonsqueezy', 'sub.payment_provider = lemonsqueezy')
  assert(sub!.provider_subscription_id === LS_SUB_ID, 'sub.provider_subscription_id copied from tx')
  assert(sub!.subscription_status === 'active', 'sub status active')
  const periodMatch = Math.abs(new Date(sub!.current_period_end).getTime() - new Date(renewsAt).getTime()) < 2000
  assert(periodMatch, 'current_period_end aligned to LS renews_at (extend_subscription_period)')

  const { data: ents } = await admin
    .from('entitlements').select('course_id, status, expires_at')
    .eq('user_id', USER).eq('source_type', 'subscription').eq('source_id', sub!.subscription_id)
  assert((ents?.length ?? 0) === 2, `entitlements granted for both plan courses (got ${ents?.length})`)
  assert(ents!.every(e => e.status === 'active'), 'entitlements active')

  // 6. Idempotency — second dispatch must not error or duplicate.
  console.log('\n5. idempotency (re-dispatch same activation)')
  await dispatchBillingEvent(event!, { provider: 'lemonsqueezy', admin })
  const { count } = await admin
    .from('subscriptions').select('*', { count: 'exact', head: true })
    .eq('user_id', USER).eq('plan_id', PLAN)
  assert(count === 1, `still exactly one subscription row (got ${count})`)

  // 7. Renewal — subscription_payment_success extends the period.
  console.log('\n6. renewal (subscription_payment_success → extend)')
  const renews2 = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString()
  const renewPayload = {
    meta: { event_name: 'subscription_payment_success', custom_data: { reference: String(txId) } },
    data: { id: 'ls_inv_1', type: 'subscription-invoices', attributes: { subscription_id: LS_SUB_ID, renews_at: renews2, updated_at: '2026-07-15T10:00:00.000000Z' } },
  }
  const renewEvent = await provider.normalizeWebhookEvent(JSON.stringify(renewPayload))
  assert(renewEvent?.type === 'subscription.renewed', 'renewal normalized to subscription.renewed')
  assert(renewEvent?.providerSubscriptionId === LS_SUB_ID, 'renewal sub id from attributes.subscription_id')
  await dispatchBillingEvent(renewEvent!, { provider: 'lemonsqueezy', admin })
  const { data: subRenewed } = await admin
    .from('subscriptions').select('current_period_end').eq('user_id', USER).eq('plan_id', PLAN).single()
  assert(Math.abs(new Date(subRenewed!.current_period_end).getTime() - new Date(renews2).getTime()) < 2000, 'period extended to new renews_at')

  await cleanup(txId)
  console.log('\n✅ Lemon Squeezy pipeline test PASSED')
}

main().catch(async (e) => {
  console.error('\n❌ TEST FAILED:', e)
  await cleanup()
  process.exit(1)
})
