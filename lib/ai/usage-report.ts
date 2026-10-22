import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

import { estimateCostUsd, priceForModel } from './pricing'

/**
 * Read side of `ai_usage_events`. Callers MUST have checked the caller is an
 * admin of `tenantId` (the RPCs are service-role only and trust the tenant id).
 * Cost is estimated here, per (provider, model) bucket, from the token sums.
 */
export const USAGE_RANGES = [7, 30, 90] as const
export type UsageRangeDays = (typeof USAGE_RANGES)[number]

export interface UsageTotals {
  calls: number
  inputTokens: number
  outputTokens: number
  /** Sum over buckets with a known price. */
  costUsd: number
  /** True when some tokens belong to a model with no known price (cost is a lower bound). */
  hasUnpriced: boolean
}

export interface FeatureUsageRow extends UsageTotals {
  feature: string
}

export interface UserUsageRow extends UsageTotals {
  userId: string | null
  fullName: string | null
}

export interface DailyUsageRow {
  day: string
  calls: number
  tokens: number
  costUsd: number
}

export interface AiUsageReport {
  days: UsageRangeDays
  totals: UsageTotals
  byFeature: FeatureUsageRow[]
  byUser: UserUsageRow[]
  daily: DailyUsageRow[]
}

interface Bucket {
  model: string
  calls: number | string
  input_tokens: number | string
  output_tokens: number | string
  cached_input_tokens: number | string
}

const num = (v: unknown) => Number(v ?? 0) || 0

const empty = (): UsageTotals => ({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, hasUnpriced: false })

function add(into: UsageTotals, b: Bucket) {
  const input = num(b.input_tokens)
  const output = num(b.output_tokens)
  into.calls += num(b.calls)
  into.inputTokens += input
  into.outputTokens += output
  const cost = estimateCostUsd(b.model, {
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: num(b.cached_input_tokens),
  })
  if (cost === null) {
    if (input + output > 0) into.hasUnpriced = true
  } else {
    into.costUsd += cost
  }
}

export function isRangeDays(v: number): v is UsageRangeDays {
  return (USAGE_RANGES as readonly number[]).includes(v)
}

export async function getAiUsageReport(tenantId: string, days: UsageRangeDays): Promise<AiUsageReport> {
  const admin = createAdminClient()
  const to = new Date(Date.now() + 60_000)
  const from = new Date(to.getTime() - days * 86_400_000)
  const args = { _tenant_id: tenantId, _from: from.toISOString(), _to: to.toISOString() }

  const [feat, user, daily] = await Promise.all([
    admin.rpc('get_ai_usage_by_feature', args),
    admin.rpc('get_ai_usage_by_user', args),
    admin.rpc('get_ai_usage_daily', args),
  ])
  if (feat.error || user.error || daily.error) throw new Error('ai-usage: could not read usage')

  const totals = empty()
  const features = new Map<string, FeatureUsageRow>()
  for (const r of (feat.data ?? []) as (Bucket & { feature: string })[]) {
    add(totals, r)
    const row = features.get(r.feature) ?? { feature: r.feature, ...empty() }
    add(row, r)
    features.set(r.feature, row)
  }

  const users = new Map<string, UserUsageRow>()
  for (const r of (user.data ?? []) as (Bucket & { user_id: string | null; full_name: string | null })[]) {
    const key = r.user_id ?? 'unknown'
    const row = users.get(key) ?? { userId: r.user_id, fullName: r.full_name, ...empty() }
    add(row, r)
    users.set(key, row)
  }

  const days_ = new Map<string, DailyUsageRow>()
  for (const r of (daily.data ?? []) as (Bucket & { day: string })[]) {
    const row = days_.get(r.day) ?? { day: r.day, calls: 0, tokens: 0, costUsd: 0 }
    const t = empty()
    add(t, r)
    row.calls += t.calls
    row.tokens += t.inputTokens + t.outputTokens
    row.costUsd += t.costUsd
    days_.set(r.day, row)
  }

  const byCost = (a: UsageTotals, b: UsageTotals) =>
    b.costUsd - a.costUsd || b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)

  return {
    days,
    totals,
    byFeature: [...features.values()].sort(byCost),
    byUser: [...users.values()].sort(byCost),
    daily: [...days_.values()].sort((a, b) => a.day.localeCompare(b.day)),
  }
}

export { priceForModel }
