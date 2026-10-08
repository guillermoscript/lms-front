/**
 * Decided constants of the platform fee sales gate (#929, design 4.2a).
 *
 * The SQL twins are `fee_gate_self_managed_renewal_window_days()` and
 * `fee_gate_in_flight_max_age_days()` in migration
 * `20261009110000_platform_fee_gate_929.sql`, which is what the trigger and
 * `is_subscription_renewal()` actually read. These TS copies exist for UI copy
 * and tests; `tests/unit/sales-gate-contract.test.ts` fails if the two ever
 * disagree, so change both together (a new migration for the SQL side).
 */

/**
 * A crypto/manual subscription holder may renew while the school is blocked
 * up to this many days after the period their last payment bought ended.
 * Deliberately separate from GRACE_DAYS (platform billing) and FEE_GRACE_DAYS.
 */
export const SELF_MANAGED_RENEWAL_WINDOW_DAYS = 30

/**
 * A PENDING native-subscription transaction anchors a first-invoice webhook
 * (rule A.2) only while it is younger than this many days.
 */
export const IN_FLIGHT_MAX_AGE_DAYS = 3
