/**
 * Connected-account readiness vocabulary — issue #606.
 *
 * Split out from `tenant-payment-readiness.ts` on purpose: that module imports
 * `createAdminClient` (service-role key), so a client component that only needs
 * the response codes must NOT import it. This file has no dependencies at all
 * and is safe on both sides of the boundary.
 */

/** Why a school cannot be paid — the two cases need different words. */
export type PaymentReadinessReason =
  /** No connected account at all: the admin never started onboarding. */
  | 'not_connected'
  /** Account exists but the provider will not let it charge yet. */
  | 'onboarding_incomplete'

export type PaymentReadiness =
  | { ready: true }
  | { ready: false; reason: PaymentReadinessReason }

/**
 * Machine-readable codes returned alongside the message so the client can
 * translate rather than echo an English server string — same contract as
 * `PARALLEL_SUBSCRIPTION_CODE` (#459).
 */
export const PAYMENTS_NOT_CONNECTED_CODE = 'SCHOOL_PAYMENTS_NOT_CONNECTED'
export const PAYMENTS_ONBOARDING_INCOMPLETE_CODE = 'SCHOOL_PAYMENTS_INCOMPLETE'

export const READINESS_CODE: Record<PaymentReadinessReason, string> = {
  not_connected: PAYMENTS_NOT_CONNECTED_CODE,
  onboarding_incomplete: PAYMENTS_ONBOARDING_INCOMPLETE_CODE,
}

/** Student-facing fallback copy, used when the client has no translation. */
export const READINESS_MESSAGE: Record<PaymentReadinessReason, string> = {
  not_connected:
    'This school has not connected a payment account yet. Please contact the school admin to set up payments.',
  onboarding_incomplete:
    'This school is still finishing its payment setup, so card payments are not available yet. Please try again later or contact the school admin.',
}

/** Admin-facing copy for the publish path — says what to do, and where. */
export const READINESS_ADMIN_MESSAGE: Record<PaymentReadinessReason, string> = {
  not_connected:
    'Connect your Stripe account in Settings → Payments before publishing a paid Stripe offering.',
  onboarding_incomplete:
    'Finish your Stripe setup in Settings → Payments before publishing a paid Stripe offering — Stripe will not accept card payments until onboarding is complete.',
}
