/**
 * Daily digest cron (issue #397) — run HOURLY (e.g. `0 * * * *`).
 *
 * Each tick checks every tenant's local hour against its configured send hour
 * (tenant_settings key `daily_digest`, default 17:00 UTC) and nudge hour
 * (default 20:00) and sends at most one digest + one streak nudge per student
 * per day. Idempotent: re-runs within the same day never double-send.
 * Secured by CRON_SECRET. Schedule in vercel.json and/or the server crontab
 * (see docs/DEPLOYMENT.md §3.5).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { runDailyDigest } from '@/lib/notifications/daily-digest'

export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase env vars not set')
  return createClient(url, serviceKey)
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || !provided || !safeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runDailyDigest(getSupabaseAdmin())
    if (result.errors.length > 0) {
      console.error('[daily-digest] partial errors', result.errors)
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[daily-digest] run failed', err)
    return NextResponse.json({ error: 'Digest run failed' }, { status: 500 })
  }
}
