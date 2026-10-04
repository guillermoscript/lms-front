/**
 * `school_activated` — the platform's headline activation metric.
 *
 * Definition (`docs/ANALYTICS_OPENPANEL.md` §4 Loop B): the FIRST moment a
 * tenant has ≥1 published course AND ≥1 connected payment provider. It is the
 * single number that best predicts platform revenue, which is exactly why a
 * duplicate ruins it — a school that publishes a second course must not look
 * like a second activation.
 *
 * TWO GUARDS, both needed:
 *   1. A `tenant_settings` row (`analytics_school_activated_at`). No migration:
 *      `tenant_settings` is already a per-tenant key/value store with a UNIQUE
 *      (tenant_id, setting_key), which is precisely the once-per-tenant latch
 *      this needs.
 *   2. The write that claims that row is an INSERT … ON CONFLICT DO NOTHING
 *      (`ignoreDuplicates`) with `.select()`, so two concurrent callers — the
 *      course publish and the provider connect can genuinely race — cannot both
 *      believe they were first. Only the caller whose insert returned a row
 *      emits the event.
 *
 * "Connected" means READY, not merely present (PR #617): a tenant with a
 * `stripe_account_id` whose owner closed the onboarding tab cannot be paid, and
 * counting it would inflate activation with schools that can't take money.
 *
 * Nothing here throws. Every entry point is wrapped: an analytics guard must
 * never fail the course publish or the wallet save that triggered it.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateConnectedAccountReadiness } from '@/lib/payments/tenant-payment-readiness'
import { ANALYTICS_EVENTS } from './events'
import { track } from './server'

/**
 * The once-per-tenant latch. Stored as `{ value: <ISO timestamp> }` to match
 * the shape every other `tenant_settings` row uses.
 */
export const SCHOOL_ACTIVATED_SETTING_KEY = 'analytics_school_activated_at'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Which payment rails this tenant can actually be paid on right now.
 *
 * Deliberately narrow: only the rails a school configures per-tenant count.
 * `manual` is always available to everyone, so counting it would mean every
 * tenant is "connected" from birth and the metric would say nothing.
 *
 * Returns canonical provider slugs. `solana` and `solana_subs` share one wallet
 * and are written together by `setSolanaWallet`, so they collapse to `solana`.
 */
export async function getConnectedPaymentProviders(
  tenantId: string,
  client?: AdminClient
): Promise<string[]> {
  const admin = client ?? createAdminClient()
  const connected: string[] = []

  const [{ data: tenant }, { data: wallets }] = await Promise.all([
    admin
      .from('tenants')
      .select('stripe_account_id, stripe_charges_enabled')
      .eq('id', tenantId)
      .maybeSingle(),
    admin
      .from('tenant_payment_wallets')
      .select('provider, wallet_address, credentials')
      .eq('tenant_id', tenantId),
  ])

  if (evaluateConnectedAccountReadiness(tenant).ready) connected.push('stripe')

  for (const wallet of wallets ?? []) {
    if (!wallet.wallet_address) continue
    if (wallet.provider === 'solana' || wallet.provider === 'solana_subs') {
      if (!connected.includes('solana')) connected.push('solana')
      continue
    }
    if (wallet.provider === 'binance_personal') {
      // Pay ID alone can't settle anything — the API credentials must be there.
      const credentials = (wallet.credentials || {}) as { api_key?: string }
      if (credentials.api_key) connected.push('binance_personal')
      continue
    }
    connected.push(wallet.provider)
  }

  return connected
}

/**
 * Is `provider` the first rail this school has connected?
 *
 * Computed as "nothing OTHER than this provider is configured", so it stays
 * correct whether the caller runs before or after its own write lands.
 */
export async function isFirstConnectedProvider(
  tenantId: string,
  provider: string,
  client?: AdminClient
): Promise<boolean> {
  try {
    const connected = await getConnectedPaymentProviders(tenantId, client)
    return connected.every((p) => p === provider)
  } catch {
    // Unknowable is not "first" — a wrong `true` would overstate how many
    // owners stall at their very first provider, which is the whole point of
    // the property.
    return false
  }
}

/**
 * Re-evaluate the activation condition and emit `school_activated` if this is
 * the moment it became true. Idempotent and safe to call on every publish and
 * every provider connect — the latch does the deduplication.
 */
export async function evaluateSchoolActivation(input: {
  tenantId: string
  userId?: string | null
  role?: string | null
  locale?: string | null
}): Promise<void> {
  const { tenantId } = input
  if (!tenantId) return

  try {
    const admin = createAdminClient()

    // Cheap pre-check: the overwhelmingly common case is an already-activated
    // school, and this spares it the two condition queries below.
    const { data: latch } = await admin
      .from('tenant_settings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('setting_key', SCHOOL_ACTIVATED_SETTING_KEY)
      .maybeSingle()
    if (latch) return

    const [{ count: publishedCourses }, connectedProviders] = await Promise.all([
      admin
        .from('courses')
        .select('course_id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'published'),
      getConnectedPaymentProviders(tenantId, admin),
    ])

    if (!publishedCourses || connectedProviders.length === 0) return

    // Claim the latch. ON CONFLICT DO NOTHING + representation: an empty result
    // means another request won the race and already emitted the event.
    const activatedAt = new Date()
    const { data: claimed, error: claimError } = await admin
      .from('tenant_settings')
      .upsert(
        {
          tenant_id: tenantId,
          setting_key: SCHOOL_ACTIVATED_SETTING_KEY,
          setting_value: { value: activatedAt.toISOString() },
        },
        { onConflict: 'tenant_id,setting_key', ignoreDuplicates: true }
      )
      .select('id')

    if (claimError || !claimed || claimed.length === 0) return

    const { data: tenant } = await admin
      .from('tenants')
      .select('created_at, plan')
      .eq('id', tenantId)
      .maybeSingle()

    const createdAt = tenant?.created_at ? new Date(tenant.created_at) : null
    const daysSinceSchoolCreated =
      createdAt && !Number.isNaN(createdAt.getTime())
        ? Math.max(
            0,
            Math.floor((activatedAt.getTime() - createdAt.getTime()) / 86_400_000)
          )
        : null

    await track(
      ANALYTICS_EVENTS.SCHOOL_ACTIVATED,
      {
        days_since_school_created: daysSinceSchoolCreated,
        published_course_count: publishedCourses,
        connected_providers: connectedProviders,
        plan: tenant?.plan ?? null,
      },
      {
        userId: input.userId ?? undefined,
        tenantId,
        role: input.role ?? undefined,
        locale: input.locale ?? undefined,
      }
    )
  } catch {
    // Never let the activation probe break the write that triggered it.
  }
}
