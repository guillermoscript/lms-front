/**
 * The USD→VES rate shown next to Pago Móvil accounts (#929).
 *
 * SERVER ONLY. Stored in `platform_fx_rates` (USD per 1 VES, one row per day),
 * the same table the fee ledger reads for VES sales. Filled on demand: the
 * first request of a day fetches `FX_VES_RATE_URL`, later ones read the row.
 * If the fetch fails the latest earlier row is shown with `:stale`; with no row
 * at all the dialog just says the equivalent must be transferred. Never throws,
 * never logs the URL or the response body.
 *
 * Env: FX_VES_RATE_URL (JSON GET), FX_VES_RATE_JSON_PATH (dot path to the
 * bolívares-per-dollar number, default `rate`), FX_VES_RATE_SOURCE (label
 * stored with the rate, default `endpoint`).
 */
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractVesPerUsd, type VesRate } from '@/lib/billing/ves-rate-convert'

const FETCH_TIMEOUT_MS = 4000

const today = (now: Date) => now.toISOString().slice(0, 10)

async function readLatest(admin: SupabaseClient): Promise<{ rate: number; date: string; source: string } | null> {
  const { data, error } = await admin
    .from('platform_fx_rates')
    .select('rate, rate_date, source')
    .eq('currency', 'VES')
    .order('rate_date', { ascending: false })
    .limit(1)
  if (error || !data?.length) return null
  const row = data[0] as { rate: number | string; rate_date: string; source: string }
  const rate = Number(row.rate)
  return rate > 0 ? { rate, date: row.rate_date, source: row.source } : null
}

/** One GET of the configured endpoint; null on any failure. */
export async function fetchVesPerUsd(): Promise<number | null> {
  const url = process.env.FX_VES_RATE_URL
  if (!url) return null
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return extractVesPerUsd(await res.json(), process.env.FX_VES_RATE_JSON_PATH || 'rate')
  } catch {
    return null
  }
}

export async function resolveVesRate(admin: SupabaseClient, now: Date = new Date()): Promise<VesRate | null> {
  try {
    const latest = await readLatest(admin)
    if (latest && latest.date === today(now)) {
      return { vesPerUsd: 1 / latest.rate, date: latest.date, source: latest.source }
    }
    const fetched = await fetchVesPerUsd()
    if (fetched) {
      const source = process.env.FX_VES_RATE_SOURCE || 'endpoint'
      const { error } = await admin
        .from('platform_fx_rates')
        .upsert({ currency: 'VES', rate_date: today(now), rate: 1 / fetched, source }, { onConflict: 'currency,rate_date' })
      if (error) console.error('[ves-rate] store failed:', error.code)
      return { vesPerUsd: fetched, date: today(now), source }
    }
    if (latest) {
      return { vesPerUsd: 1 / latest.rate, date: latest.date, source: `${latest.source}:stale` }
    }
  } catch {
    console.error('[ves-rate] failed')
  }
  return null
}

/** Deduplicated per request. */
export const loadVesRate = cache(() => resolveVesRate(createAdminClient()))
