import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Account deletion (#850) — required by Google Play and the App Store.
 *
 * Deleting an account is `auth.admin.deleteUser()`; the foreign keys set by
 * migration 20260927120000 decide the rest: the person's own activity is
 * removed, money records stay anonymised (user_id → NULL), and content they
 * authored for a school stays with the school, unattributed.
 */

export type AccountDeletionBlocker =
  | { reason: 'super_admin' }
  | { reason: 'sole_admin'; school: string }
  | { reason: 'live_subscription'; plan: string | null }

/** Why the account can't be deleted yet; empty when it can. */
export async function getAccountDeletionBlockers(userId: string): Promise<AccountDeletionBlocker[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('account_deletion_blockers', { _user_id: userId })
  if (error) throw error
  return ((data ?? []) as { reason: string; detail: string | null }[]).map((row) => {
    if (row.reason === 'sole_admin') return { reason: 'sole_admin', school: row.detail ?? '' }
    if (row.reason === 'live_subscription') return { reason: 'live_subscription', plan: row.detail }
    return { reason: 'super_admin' }
  })
}

/**
 * The phrase the caller must type to confirm: their email, or `DELETE` for an
 * account without one. Compared case-insensitively.
 */
export function deletionConfirmationPhrase(user: Pick<User, 'email'>): string {
  return user.email?.trim() || 'DELETE'
}

export function isDeletionConfirmed(user: Pick<User, 'email'>, typed: unknown): boolean {
  return (
    typeof typed === 'string' &&
    typed.trim().toLowerCase() === deletionConfirmationPhrase(user).toLowerCase()
  )
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; blockers: AccountDeletionBlocker[] }

/**
 * Delete the account for good. Refuses while a blocker stands; otherwise
 * closes pending payments, removes the person's uploaded files (best effort —
 * a file left behind must not keep the account alive), and deletes the auth
 * user, which cascades through the database.
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const blockers = await getAccountDeletionBlockers(userId)
  if (blockers.length > 0) return { ok: false, blockers }

  const admin = createAdminClient()
  const { data: files, error: prepareError } = await admin.rpc('prepare_account_deletion', {
    _user_id: userId,
  })
  if (prepareError) throw prepareError

  const byBucket = new Map<string, string[]>()
  for (const file of (files ?? []) as { bucket_id: string; name: string }[]) {
    byBucket.set(file.bucket_id, [...(byBucket.get(file.bucket_id) ?? []), file.name])
  }
  for (const [bucket, names] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(names)
    if (error) console.error(`Account deletion: could not remove files from ${bucket}:`, error)
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) throw deleteError
  return { ok: true }
}
