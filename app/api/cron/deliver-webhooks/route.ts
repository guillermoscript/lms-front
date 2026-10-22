/**
 * Cron: deliver queued outbound webhooks and prune old delivery logs.
 * Runs every minute (vercel.json). Secured by CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { processDueDeliveries } from '@/lib/webhooks/deliver'

export const runtime = 'nodejs'
export const maxDuration = 60

const RETENTION_DAYS = 30

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!cronSecret || !provided || !safeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const result = await processDueDeliveries(admin, 100)

    // Prune once an hour (first minute) so the log table stays bounded.
    let pruned = 0
    if (new Date().getUTCMinutes() === 0) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()
      const { count } = await admin
        .from('outbound_webhook_deliveries')
        .delete({ count: 'exact' })
        .neq('status', 'pending')
        .lt('created_at', cutoff)
      pruned = count ?? 0
    }
    return NextResponse.json({ ...result, pruned })
  } catch (err) {
    console.error('[deliver-webhooks] run failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Delivery run failed' }, { status: 500 })
  }
}
