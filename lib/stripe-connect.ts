import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ConnectStatus {
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
}

/**
 * Pull the live onboarding status of a Connect account from Stripe and
 * mirror it onto the tenant row. The `account.updated` webhook is the
 * primary signal; this covers webhook lag and local dev (no webhooks),
 * so Settings→Payments reflects reality right after the admin returns
 * from hosted onboarding. Returns null on any failure — callers fall
 * back to the DB state.
 */
export async function syncConnectAccountStatus(
  tenantId: string,
  accountId: string
): Promise<ConnectStatus | null> {
  try {
    const account = await getStripe().accounts.retrieve(accountId)
    const status: ConnectStatus = {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
    }
    await createAdminClient()
      .from('tenants')
      .update({
        stripe_charges_enabled: status.chargesEnabled,
        stripe_payouts_enabled: status.payoutsEnabled,
        stripe_details_submitted: status.detailsSubmitted,
      })
      .eq('id', tenantId)
    return status
  } catch (err) {
    console.error('[stripe-connect] failed to sync account status:', err)
    return null
  }
}
