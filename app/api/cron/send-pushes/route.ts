/**
 * Push notification sweep (issue #835) — run EVERY MINUTE.
 *
 * Sends each pending `user_notifications` row to the recipient's devices
 * through Expo, once. pg_cron is the scheduler (`send-pushes-every-minute` →
 * `invoke_cron_route('send-pushes')`); GitHub Actions cannot keep a one-minute
 * cadence, so `cron.yml` only offers it for manual runs. Overlapping runs are
 * safe: rows are claimed atomically, see lib/notifications/push.ts.
 *
 * Secured by CRON_SECRET (Bearer token).
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPendingPushes } from '@/lib/notifications/push'

export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || !provided || !safeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendPendingPushes(createAdminClient())
    if (result.errors.length > 0) {
      console.error('[send-pushes] partial errors', result.errors)
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[send-pushes] run failed', err)
    return NextResponse.json({ error: 'Push run failed' }, { status: 500 })
  }
}
