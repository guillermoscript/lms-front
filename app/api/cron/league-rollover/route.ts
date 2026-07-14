/**
 * Weekly league rollover cron (issue #394).
 *
 * Calls the `rollover_all_leagues()` RPC, which iterates every tenant itself:
 * plan-gating, `tenant_settings` opt-out, and cold-start (no prior week) are
 * all handled in SQL. pg_cron ('league-weekly-rollover', Mondays 00:05) is the
 * primary scheduler — this route is a manual trigger + Dokploy/Vercel fallback.
 *
 * Secured by CRON_SECRET (Bearer token).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'

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

  const admin = getSupabaseAdmin()

  const { data, error } = await admin.rpc('rollover_all_leagues')

  if (error) {
    console.error('[league-rollover] rpc error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, memberships_created: data })
}
