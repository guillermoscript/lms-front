/**
 * Cost caps and abuse limits for exercise challenges (epic #1025, WS7).
 *
 * Every guest attempt is an AI grading call paid with the SCHOOL's BYOK key,
 * so these caps exist to protect that bill. Layers, cheapest first:
 *   1. In-memory burst limiter keyed by `tenantId:ipHash` (`lib/rate-limit.ts`)
 *      and a short-lived in-memory "pending" count of attempts this instance
 *      has just allowed but that may not be written to the DB yet. Both are
 *      PER SERVER INSTANCE and reset on deploy.
 *   2. Hourly cap per IP (guests only) and per device (guest token) / per user,
 *      counted in the DB from `challenge_attempts` (+ pending).
 *   3. Monthly guest cap per tenant (`challenges_guest_monthly_cap` in
 *      `tenant_settings`, default 200) — when reached the challenge is `paused`.
 *   4. Official attempt: one per person per exercise. A person who already has
 *      one is NOT rate limited; they get `official: false` (practice only,
 *      still counted against the caps).
 *
 * Members (`userId` set) skip the IP cap, because a school behind one NAT must
 * not trip it; they are capped per user instead and never count towards the
 * guest monthly cap.
 *
 * LIMITATIONS (honest):
 *  - Caps protect the school's BYOK cost; they do NOT stop a determined
 *    distributed attacker (many IPs, many fresh guest tokens). The monthly cap
 *    is the hard ceiling on spend in that case.
 *  - Check and write are NOT atomic. The caller grades and inserts after this
 *    returns `ok`, so parallel requests can overshoot a DB-counted cap. The
 *    in-memory pending count bounds the overshoot to roughly one extra attempt
 *    per OTHER server instance per cap window (and pending entries expire after
 *    PENDING_TTL_MS, so a slow grade can also overshoot on the same instance).
 *    Pending entries are not removed when the row lands, so for up to the TTL a
 *    just-written attempt is counted twice: the caps err on the strict side.
 *  - Any internal error fails CLOSED (`paused`).
 *
 * Raw IPs are never stored: `hashIp` is an HMAC with a server secret.
 * Reads use the admin client with explicit `tenant_id` filters.
 */
import { createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { DEFAULT_GUEST_MONTHLY_CAP } from '@/lib/challenges/settings'

export type ChallengeLimitResult =
  | { status: 'ok'; official: boolean }
  | { status: 'rate_limited' }
  | { status: 'paused' }

export interface ChallengeLimitInput {
  tenantId: string
  exerciseId: number
  ipHash: string
  /** Hash of the guest device token. Required when `userId` is not set. */
  guestTokenHash: string | null
  /** Set for signed-in tenant members; they skip the IP cap. */
  userId?: string | null
}

export const MONTHLY_CAP_SETTING_KEY = 'challenges_guest_monthly_cap'
/** Used when the tenant has not configured `challenges_guest_monthly_cap`. */
export { DEFAULT_GUEST_MONTHLY_CAP }
/** Used when the stored cap exists but is malformed or negative. */
export const SAFE_GUEST_MONTHLY_CAP = 20
/** Max attempts per IP (guests), per device and per user in a rolling hour. */
export const GUEST_HOURLY_CAP = 5
/** First-layer in-memory burst cap per tenant+IP, per minute. */
export const BURST_PER_MINUTE = 30
/** How long an allowed-but-maybe-unwritten attempt is held in memory. */
export const PENDING_TTL_MS = 2 * 60 * 1000

const HOUR_MS = 60 * 60 * 1000

const burstLimiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 5000 })

const pending = new Map<string, number[]>()

function pendingCount(key: string, now: number): number {
  const fresh = (pending.get(key) ?? []).filter((t) => now - t < PENDING_TTL_MS)
  if (fresh.length) pending.set(key, fresh)
  else pending.delete(key)
  return fresh.length
}

function addPending(key: string, now: number) {
  const list = pending.get(key) ?? []
  list.push(now)
  pending.set(key, list)
}

/** HMAC-SHA256 of the IP with a server secret; the raw IP is never persisted. */
export function hashIp(ip: string): string {
  let secret = process.env.CHALLENGE_IP_HASH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CHALLENGE_IP_HASH_SECRET is not configured')
    }
    secret = 'dev-only-challenge-ip-hash-secret'
  }
  return createHmac('sha256', secret).update(ip).digest('hex')
}

/** Start of the current UTC month. */
export function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function parseCap(row: { setting_value: unknown } | null): number {
  if (!row) return DEFAULT_GUEST_MONTHLY_CAP
  const v = row.setting_value
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : SAFE_GUEST_MONTHLY_CAP
}

export async function checkChallengeLimits(
  input: ChallengeLimitInput,
): Promise<ChallengeLimitResult> {
  try {
    return await run(input)
  } catch (err) {
    // Fail closed. Log the message only: never the hashes, tokens or secrets.
    console.error(
      '[challenges/limits] check failed, pausing:',
      err instanceof Error ? err.message : 'unknown error',
    )
    return { status: 'paused' }
  }
}

async function run(input: ChallengeLimitInput): Promise<ChallengeLimitResult> {
  const { tenantId, exerciseId, ipHash, guestTokenHash } = input
  const userId = input.userId || null
  const isGuest = !userId

  // A guest without a device token cannot be tracked: refuse.
  if (isGuest && !guestTokenHash) return { status: 'rate_limited' }

  try {
    await burstLimiter.check(BURST_PER_MINUTE, `${tenantId}:${userId ?? ipHash}`)
  } catch {
    return { status: 'rate_limited' }
  }

  const admin = createAdminClient()
  const nowDate = new Date()
  const now = nowDate.getTime()
  const hourAgo = new Date(now - HOUR_MS).toISOString()
  const who = userId ? 'user_id' : 'guest_token_hash'
  const whoValue = (userId ?? guestTokenHash) as string

  const tenantKey = `${tenantId}:tenant`
  const ipKey = `${tenantId}:ip:${ipHash}`
  const whoKey = `${tenantId}:${who}:${whoValue}`

  // Monthly tenant cap: guests only (guest_token_hash set) this UTC month.
  if (isGuest) {
    const [setting, monthly] = await Promise.all([
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
        .gte('created_at', monthStart(nowDate).toISOString()),
    ])
    if (setting.error) throw setting.error
    if (monthly.error) throw monthly.error
    const cap = parseCap(setting.data)
    if ((monthly.count ?? 0) + pendingCount(tenantKey, now) >= cap) {
      return { status: 'paused' }
    }
  }

  const whoHour = admin
    .from('challenge_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq(who, whoValue)
    .gte('created_at', hourAgo)
  const official = admin
    .from('challenge_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('exercise_id', exerciseId)
    .eq(who, whoValue)
    .eq('is_official', true)
  const ipHour = isGuest
    ? admin
        .from('challenge_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('ip_hash', ipHash)
        .not('guest_token_hash', 'is', null)
        .is('user_id', null)
        .gte('created_at', hourAgo)
    : null

  const [whoRes, officialRes, ipRes] = await Promise.all([whoHour, official, ipHour])
  for (const r of [whoRes, officialRes, ipRes]) if (r?.error) throw r.error

  if ((whoRes.count ?? 0) + pendingCount(whoKey, now) >= GUEST_HOURLY_CAP) {
    return { status: 'rate_limited' }
  }
  if (ipRes && (ipRes.count ?? 0) + pendingCount(ipKey, now) >= GUEST_HOURLY_CAP) {
    return { status: 'rate_limited' }
  }

  addPending(whoKey, now)
  if (isGuest) {
    addPending(ipKey, now)
    addPending(tenantKey, now)
  }
  return { status: 'ok', official: (officialRes.count ?? 0) === 0 }
}
