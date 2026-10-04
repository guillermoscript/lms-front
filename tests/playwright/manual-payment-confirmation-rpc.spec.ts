import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import type { Database } from '@/lib/database.types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''

test.describe('transactional manual platform-payment confirmation (#623)', () => {
  test.skip(!url || !serviceKey, 'Local Supabase service-role credentials are required')

  let admin: SupabaseClient<Database>
  let tenantId: string

  test.beforeEach(() => {
    admin = createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    tenantId = randomUUID()
  })

  test.afterEach(async () => {
    if (!admin || !tenantId) return
    await admin.from('platform_payment_requests').delete().eq('tenant_id', tenantId)
    await admin.from('platform_subscription_switches').delete().eq('tenant_id', tenantId)
    await admin.from('platform_subscriptions').delete().eq('tenant_id', tenantId)
    await admin.from('revenue_splits').delete().eq('tenant_id', tenantId)
    await admin.from('tenants').delete().eq('id', tenantId)
  })

  test('serializes concurrent confirms and preserves one period and audit stamp', async () => {
    const [{ data: actor, error: actorError }, { data: plan, error: planError }] = await Promise.all([
      admin.from('super_admins').select('user_id').limit(1).single(),
      admin
        .from('platform_plans')
        .select('plan_id, slug, transaction_fee_percent')
        .eq('slug', 'business')
        .single(),
    ])
    expect(actorError).toBeNull()
    expect(planError).toBeNull()
    expect(actor).not.toBeNull()
    expect(plan).not.toBeNull()

    const initialPeriodStart = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const initialPeriodEnd = new Date(Date.now() + 40 * 86_400_000).toISOString()
    const slug = `issue-623-${tenantId.slice(0, 8)}`

    const { error: tenantError } = await admin.from('tenants').insert({
      id: tenantId,
      name: 'Issue 623 Transaction Test',
      slug,
      plan: plan!.slug,
      billing_status: 'active',
      billing_period_end: initialPeriodEnd,
    })
    expect(tenantError).toBeNull()

    const { error: subscriptionError } = await admin.from('platform_subscriptions').insert({
      tenant_id: tenantId,
      plan_id: plan!.plan_id,
      status: 'active',
      payment_provider: 'manual',
      interval: 'monthly',
      current_period_start: initialPeriodStart,
      current_period_end: initialPeriodEnd,
      cancel_at_period_end: false,
    })
    expect(subscriptionError).toBeNull()

    const { data: request, error: requestError } = await admin
      .from('platform_payment_requests')
      .insert({
        tenant_id: tenantId,
        plan_id: plan!.plan_id,
        requested_by: actor!.user_id,
        interval: 'monthly',
        amount: 79,
        currency: 'usd',
        status: 'payment_received',
        request_type: 'renewal',
        payment_provider: 'manual',
        bank_reference: 'ISSUE-623-CONCURRENT',
        proof_url: 'proofs/issue-623-concurrent.png',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('request_id')
      .single()
    expect(requestError).toBeNull()

    const expected = await admin.rpc('calculate_platform_billing_period', {
      _current_period_end: initialPeriodEnd,
      _interval: 'monthly',
      _is_renewal: true,
      _now: new Date().toISOString(),
    })
    expect(expected.error).toBeNull()

    const confirm = () =>
      admin.rpc('confirm_platform_payment_request', {
        _request_id: request!.request_id,
        _confirmed_by: actor!.user_id,
      })

    const [first, second] = await Promise.all([confirm(), confirm()])
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect([first.data?.[0].applied, second.data?.[0].applied].sort()).toEqual([false, true])

    const [{ data: storedRequest }, { data: subscription }, { data: tenant }, { data: split }] =
      await Promise.all([
        admin
          .from('platform_payment_requests')
          .select('status, confirmed_by, confirmed_at, amount, currency, bank_reference, proof_url')
          .eq('request_id', request!.request_id)
          .single(),
        admin
          .from('platform_subscriptions')
          .select('current_period_start, current_period_end, cancel_at_period_end, canceled_at')
          .eq('tenant_id', tenantId)
          .single(),
        admin
          .from('tenants')
          .select('plan, billing_status, billing_period_end')
          .eq('id', tenantId)
          .single(),
        admin
          .from('revenue_splits')
          .select('platform_percentage, school_percentage')
          .eq('tenant_id', tenantId)
          .single(),
      ])

    expect(storedRequest).toMatchObject({
      status: 'confirmed',
      confirmed_by: actor!.user_id,
      amount: 79,
      currency: 'usd',
      bank_reference: 'ISSUE-623-CONCURRENT',
      proof_url: 'proofs/issue-623-concurrent.png',
    })
    expect(storedRequest?.confirmed_at).not.toBeNull()
    expect(subscription).toMatchObject({
      current_period_end: expected.data?.[0].period_end,
      cancel_at_period_end: false,
      canceled_at: null,
    })
    expect(new Date(subscription!.current_period_start!).getTime()).toBe(
      new Date(initialPeriodEnd).getTime(),
    )
    expect(tenant).toMatchObject({
      plan: plan!.slug,
      billing_status: 'active',
      billing_period_end: expected.data?.[0].period_end,
    })
    expect(split).toMatchObject({
      platform_percentage: plan!.transaction_fee_percent,
      school_percentage: 100 - plan!.transaction_fee_percent,
    })

    const replay = await confirm()
    expect(replay).toMatchObject({ data: [{ applied: false }], error: null })
    expect(replay.data?.[0].confirmed_at).toBe(storedRequest?.confirmed_at)
    expect(replay.data?.[0].period_end).toBe(subscription?.current_period_end)
  })

  test('denies direct RPC execution to the anonymous role', async () => {
    test.skip(!anonKey, 'Local Supabase anon key is required')
    const anon = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const denied = await anon.rpc('confirm_platform_payment_request', {
      _request_id: randomUUID(),
      _confirmed_by: randomUUID(),
    })

    expect(denied.error).not.toBeNull()
  })
})
