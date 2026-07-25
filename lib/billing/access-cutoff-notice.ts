/**
 * The tenant-admin view of an access cutoff (issue #517).
 *
 * #494 stored `tenants.access_cutoff_at` and mailed it once. The only place
 * that ever read it back for a human was `/dashboard/admin/billing`, so an
 * admin who never opened that page had no in-app signal at all — the first
 * they'd know was students reporting they'd lost access.
 *
 * This module answers one question for the dashboard shell: is there a cutoff
 * an admin needs to see right now, and how urgent is it. The day arithmetic is
 * pure and `now`-injectable so it can be reasoned about without a clock.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const DAY_MS = 24 * 60 * 60 * 1000

export interface AccessCutoffNotice {
  cutoffAt: string
  /** True once the cutoff has passed — students have already lost access. */
  active: boolean
  /**
   * Whole days until access stops, rounded up, floored at 0. `1` means
   * "tomorrow"; `0` alongside `active: false` means "later today".
   */
  daysRemaining: number
}

/**
 * Pure: turn a stored cutoff timestamp into what the banner needs.
 * Returns null when there is nothing to show (no cutoff, unparseable value).
 */
export function describeAccessCutoff(input: {
  cutoffAt: string | null | undefined
  now: Date
}): AccessCutoffNotice | null {
  const { cutoffAt, now } = input
  if (!cutoffAt) return null

  const cutoffMs = new Date(cutoffAt).getTime()
  if (Number.isNaN(cutoffMs)) return null

  const msRemaining = cutoffMs - now.getTime()

  return {
    cutoffAt,
    active: msRemaining <= 0,
    daysRemaining: msRemaining <= 0 ? 0 : Math.ceil(msRemaining / DAY_MS),
  }
}

/**
 * Read the current tenant's cutoff state. Uses the admin client because
 * `tenants` is not readable in full by an authenticated member, and this runs
 * on every admin dashboard render — a single indexed single-row read, gated by
 * the caller to admins only.
 */
export async function getAccessCutoffNotice(
  tenantId: string,
  now: Date = new Date()
): Promise<AccessCutoffNotice | null> {
  if (!tenantId) return null

  const supabase = createAdminClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('access_cutoff_at')
    .eq('id', tenantId)
    .maybeSingle()

  return describeAccessCutoff({ cutoffAt: tenant?.access_cutoff_at, now })
}
