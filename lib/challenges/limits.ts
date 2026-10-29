/**
 * Cost caps and abuse limits for guest exercise challenges (epic #1025, WS7).
 *
 * Every guest attempt is an AI grading call paid with the SCHOOL's BYOK key,
 * so these caps exist to protect that bill. Layers, cheapest first:
 *   1. In-memory per-IP burst limiter (`lib/rate-limit.ts`) — per server
 *      instance, resets on deploy; only a cheap brake on a runaway script.
 *   2. One official attempt per guest per exercise, counted in the DB.
 *   3. Hourly cap per IP and per device (guest token), counted in the DB from
 *      `challenge_attempts`, which is durable and shared across instances.
 *   4. Monthly guest cap per tenant (`challenges_guest_monthly_cap` in
 *      `tenant_settings`) — when reached the challenge is `paused`.
 *
 * LIMITATION: these caps bound the school's cost and stop casual abuse. They
 * do NOT stop a determined distributed attacker (many IPs, many fresh guest
 * tokens); the monthly cap is the hard ceiling on spend in that case.
 *
 * Raw IPs are never stored: `hashIp` is an HMAC with a server secret.
 * Reads use the admin client with explicit `tenant_id` filters.
 */
import { createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'

export type ChallengeLimitResult =
  | { status: 'ok' }
  | { status: 'rate_limited' }
  | { status: 'paused' }

export interface ChallengeLimitInput {
  tenantId: string
  exerciseId: number
  ipHash: string
  guestTokenHash: string | null
}

export const MONTHLY_CAP_SETTING_KEY = 'challenges_guest_monthly_cap'
/** Used when the tenant has not configured `challenges_guest_monthly_cap`. */
export const DEFAULT_GUEST_MONTHLY_CAP = 200
/** Max guest attempts per IP, and per device, in a rolling hour. */
export const GUEST_HOURLY_CAP = 5
/** First-layer in-memory burst cap per IP hash, per minute. */
export const BURST_PER_MINUTE = 30

const HOUR_MS = 60 * 60 * 1000

const burstLimiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 5000 })

/** HMAC-SHA256 of the IP with a server secret; the raw IP is never persisted. */
export function hashIp(ip: string): string {
  const secret =
    process.env.CHALLENGE_IP_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('CHALLENGE_IP_HASH_SECRET is not configured')
  return createHmac('sha256', secret).update(ip).digest('hex')
}

/** Start of the current UTC month. */
export function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function parseCap(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 0
    ? n
    : DEFAULT_GUEST_MONTHLY_CAP
}

export async function checkChallengeLimits(
  input: ChallengeLimitInput,
): Promise<ChallengeLimitResult> {
  const { tenantId, exerciseId, ipHash, guestTokenHash } = input

  try {
    await burstLimiter.check(BURST_PER_MINUTE, ipHash)
  } catch {
    return { status: 'rate_limited' }
  }

  const admin = createAdminClient()
  const now = new Date()

  // Monthly tenant cap: guest attempts (guest_token_hash set) this UTC month.
  const [{ data: setting }, monthly] = await Promise.all([
    admin
      .from('tenant_settings')
      .select('setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', MONTHLY_CAP_SETTING_KEY)
      .maybeSingle(),
    admin
      .from('challenge_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('guest_token_hash', 'is', null)
      .gte('created_at', monthStart(now).toISOString()),
  ])
  if (monthly.error) throw monthly.error
  const cap = parseCap(setting?.setting_value)
  if ((monthly.count ?? 0) >= cap) return { status: 'paused' }

  const hourAgo = new Date(now.getTime() - HOUR_MS).toISOString()
  const queries = [
    // Hourly cap per IP.
    admin
      .from('challenge_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('ip_hash', ipHash)
      .gte('created_at', hourAgo),
  ]
  if (guestTokenHash) {
    queries.push(
      // Hourly cap per device.
      admin
        .from('challenge_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('guest_token_hash', guestTokenHash)
        .gte('created_at', hourAgo),
      // One official attempt per guest per exercise.
      admin
        .from('challenge_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('exercise_id', exerciseId)
        .eq('guest_token_hash', guestTokenHash)
        .eq('is_official', true),
    )
  }
  const results = await Promise.all(queries)
  for (const r of results) if (r.error) throw r.error

  const [ipHour, deviceHour, official] = results
  if ((ipHour.count ?? 0) >= GUEST_HOURLY_CAP) return { status: 'rate_limited' }
  if (deviceHour && (deviceHour.count ?? 0) >= GUEST_HOURLY_CAP) return { status: 'rate_limited' }
  if (official && (official.count ?? 0) >= 1) return { status: 'rate_limited' }

  return { status: 'ok' }
}
