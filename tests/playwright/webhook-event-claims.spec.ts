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

test.describe('atomic webhook event claims', () => {
  test.skip(!url || !serviceKey, 'Local Supabase service-role credentials are required')

  let admin: SupabaseClient<Database>
  let provider: string
  const providerEventId = 'same-delivery'

  test.beforeEach(() => {
    admin = createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    provider = `claim-test:${randomUUID()}`
  })

  test.afterEach(async () => {
    if (admin && provider) {
      await admin.from('webhook_events').delete().eq('provider', provider)
    }
  })

  async function claim(token: string, leaseSeconds = 300) {
    return admin.rpc('claim_webhook_event', {
      _provider: provider,
      _provider_event_id: providerEventId,
      _event_type: 'subscription.renewed',
      _payload: { id: providerEventId },
      _claim_token: token,
      _lease_seconds: leaseSeconds,
    })
  }

  test('grants one concurrent owner, fences stale workers, and recovers failures and expired leases', async () => {
    const firstToken = randomUUID()
    const secondToken = randomUUID()
    const [first, second] = await Promise.all([claim(firstToken), claim(secondToken)])

    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    const outcomes = [first.data?.[0].claim_status, second.data?.[0].claim_status].sort()
    expect(outcomes).toEqual(['claimed', 'processing'])

    const winner = first.data?.[0].claim_status === 'claimed' ? firstToken : secondToken
    const loser = winner === firstToken ? secondToken : firstToken
    const eventId = (first.data?.[0].event_id ?? second.data?.[0].event_id) as string

    const { data: row } = await admin
      .from('webhook_events')
      .select('attempt_count, processing_token, processing_started_at, processing_lease_expires_at, processed_at')
      .eq('id', eventId)
      .single()
    expect(row).toMatchObject({ attempt_count: 1, processing_token: winner, processed_at: null })
    expect(row?.processing_started_at).not.toBeNull()
    expect(row?.processing_lease_expires_at).not.toBeNull()

    const staleComplete = await admin.rpc('complete_webhook_event', {
      _event_id: eventId,
      _claim_token: loser,
    })
    expect(staleComplete).toMatchObject({ data: false, error: null })

    const failed = await admin.rpc('fail_webhook_event', {
      _event_id: eventId,
      _claim_token: winner,
      _last_error: 'injected transient failure',
    })
    expect(failed).toMatchObject({ data: true, error: null })

    const retryToken = randomUUID()
    const retry = await claim(retryToken)
    expect(retry.data?.[0]).toMatchObject({ claim_status: 'claimed', current_attempt_count: 2 })

    const activeDuplicate = await claim(randomUUID(), 1)
    expect(activeDuplicate.data?.[0]).toMatchObject({
      claim_status: 'processing',
      current_attempt_count: 2,
    })

    await admin
      .from('webhook_events')
      .update({
        processing_started_at: '2000-01-01T00:00:00.000Z',
        processing_lease_expires_at: '2000-01-01T00:05:00.000Z',
      })
      .eq('id', eventId)
    const recoveredToken = randomUUID()
    const recovered = await claim(recoveredToken, 1)
    expect(recovered.data?.[0]).toMatchObject({ claim_status: 'claimed', current_attempt_count: 3 })

    const completed = await admin.rpc('complete_webhook_event', {
      _event_id: eventId,
      _claim_token: recoveredToken,
    })
    expect(completed).toMatchObject({ data: true, error: null })

    const replay = await claim(randomUUID())
    expect(replay.data?.[0]).toMatchObject({
      claim_status: 'completed',
      current_attempt_count: 3,
    })
  })

  test('keeps student and platform namespaces independent', async () => {
    const student = await claim(randomUUID())
    provider = `platform:${provider}`
    const platform = await claim(randomUUID())

    expect(student.data?.[0].claim_status).toBe('claimed')
    expect(platform.data?.[0].claim_status).toBe('claimed')
    expect(platform.data?.[0].event_id).not.toBe(student.data?.[0].event_id)
  })

  test('denies claim execution to the anonymous role', async () => {
    test.skip(!anonKey, 'Local Supabase anon key is required')
    const anon = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const denied = await anon.rpc('claim_webhook_event', {
      _provider: provider,
      _provider_event_id: providerEventId,
      _event_type: 'payment.succeeded',
      _payload: {},
      _claim_token: randomUUID(),
      _lease_seconds: 300,
    })

    expect(denied.error).not.toBeNull()
  })
})
