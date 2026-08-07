/**
 * Can this school actually be paid on this rail? — issue #606.
 *
 * `tenants.stripe_account_id` is written the instant `stripe.accounts.create`
 * returns, which is BEFORE the admin is even handed the hosted onboarding link
 * (`app/api/stripe/connect/route.ts`). So it answers "did an Express account
 * object get minted", not "can this school charge a card". An admin who opens
 * onboarding and closes the tab leaves a tenant that looks payment-ready and is
 * not — the student reaches the card form, submits, and Stripe rejects the
 * PaymentIntent because `transfer_data.destination` points at an account with
 * `charges_enabled: false`.
 *
 * The readiness signal already exists and is already synced two ways: the
 * `account.updated` webhook (`app/api/stripe/webhook/route.ts`) and
 * `syncConnectAccountStatus()` (`lib/stripe-connect.ts`), which the Settings →
 * Payments page force-runs whenever charges are still disabled. This module is
 * the single place that READS it, so checkout and the publish path can never
 * drift apart on what "ready" means.
 *
 * Capability-driven, never provider-name-driven: the branch is
 * `ProviderCapabilities.requiresConnectedAccount`. Rails without a per-tenant
 * account to onboard (manual, the platform-settled trio, both Solana rails)
 * short-circuit to ready without touching the database.
 *
 * SERVER ONLY — it reaches for the service-role client. Client components that
 * just need the response codes import `./payment-readiness-codes` instead.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from './types'
import {
  READINESS_ADMIN_MESSAGE,
  type PaymentReadiness,
} from './payment-readiness-codes'

export * from './payment-readiness-codes'

/** The subset of the tenant row that decides readiness. */
export interface ConnectedAccountRow {
  stripe_account_id: string | null
  stripe_charges_enabled: boolean | null
}

/**
 * Pure half of the check: given the tenant's connected-account columns, is the
 * school ready? Split out so the truth table is unit-testable without a database.
 *
 * `charges_enabled` and not `details_submitted`: an Express account can have
 * submitted its details and still be blocked (Stripe review, or fresh
 * `currently_due` requirements). Only `charges_enabled` means money can move.
 */
export function evaluateConnectedAccountReadiness(
  row: ConnectedAccountRow | null | undefined
): PaymentReadiness {
  if (!row?.stripe_account_id) return { ready: false, reason: 'not_connected' }
  if (!row.stripe_charges_enabled) return { ready: false, reason: 'onboarding_incomplete' }
  return { ready: true }
}

/**
 * Is `tenantId` able to accept a payment on `provider` right now?
 *
 * Call this BEFORE any provider side effect (customer creation, PaymentIntent,
 * pending transaction row) and before publishing a paid offering.
 */
export async function isReadyToAcceptPayments(
  tenantId: string,
  provider: PaymentProvider
): Promise<PaymentReadiness> {
  // Rails with no per-tenant account to onboard are always ready — and cost no
  // query to say so.
  if (!PROVIDER_CAPABILITIES[provider]?.requiresConnectedAccount) {
    return { ready: true }
  }

  const { data, error } = await createAdminClient()
    .from('tenants')
    .select('stripe_account_id, stripe_charges_enabled')
    .eq('id', tenantId)
    .single()

  // A tenant we cannot read is not a tenant we can route money to. Refuse as
  // "not connected" rather than falling open.
  if (error || !data) return { ready: false, reason: 'not_connected' }

  return evaluateConnectedAccountReadiness(data)
}

/**
 * Publish-path form of the same gate: throws with admin-facing, actionable copy
 * so a school cannot publish a paid offering on a rail it cannot be paid on.
 * The server actions already surface a thrown message to the admin verbatim.
 */
export async function assertReadyToPublish(
  tenantId: string,
  provider: PaymentProvider
): Promise<void> {
  const readiness = await isReadyToAcceptPayments(tenantId, provider)
  if (!readiness.ready) {
    throw new Error(READINESS_ADMIN_MESSAGE[readiness.reason])
  }
}
