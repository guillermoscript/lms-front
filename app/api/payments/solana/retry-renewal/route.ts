import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { paymentAuthLimiter } from '@/lib/rate-limit'
import { renewSolanaSubscription, type SolanaRenewalRow } from '@/lib/payments/solana-renewal'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Cookie-authenticated payment retries are same-origin only.
  const origin = req.headers.get('origin')
  // Next's internal URL can use localhost behind a local/reverse proxy. Match
  // the browser's actual requested Host, while retaining the request scheme.
  const requestedOrigin = `${req.nextUrl.protocol}//${req.headers.get('host')}`
  if (!origin || origin !== requestedOrigin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { await paymentAuthLimiter.check(5, user.id) } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  if (!Number.isSafeInteger(body?.subscriptionId) || body.subscriptionId <= 0) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }
  const tenantId = await getCurrentTenantId()
  // Prove tenant + ownership under RLS before invoking the privileged puller.
  const { data: owned, error } = await supabase.from('subscriptions').select('subscription_id')
    .eq('subscription_id', body.subscriptionId).eq('user_id', user.id).eq('tenant_id', tenantId)
    .eq('payment_provider', 'solana_subs').maybeSingle()
  if (error || !owned) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  const admin = createAdminClient()
  const { data: sub, error: subError } = await admin.from('subscriptions')
    .select('subscription_id,start_date,tenant_id,plan_id,subscription_status,cancel_at_period_end,cancel_at,provider_subscription_id,provider_metadata,plans(price)')
    .eq('subscription_id', owned.subscription_id).single()
  if (subError || !sub) return NextResponse.json({ error: 'Subscription unavailable' }, { status: 503 })
  try {
    const result = await renewSolanaSubscription(admin, sub as SolanaRenewalRow, { recoveryOnly: body.recoveryOnly === true })
    return NextResponse.json(result, { status: result.status === 'insufficient_funds' ? 422 : 200 })
  } catch (error) {
    console.error('[solana/retry-renewal] payment could not be confirmed', error)
    return NextResponse.json({ status: 'unconfirmed' }, { status: 503 })
  }
}
