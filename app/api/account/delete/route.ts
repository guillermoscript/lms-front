import { z } from 'zod'
import { getApiUser } from '@/lib/supabase/api-auth'
import {
  deleteAccount,
  deletionConfirmationPhrase,
  getAccountDeletionBlockers,
  isDeletionConfirmed,
} from '@/lib/account/delete-account'

const bodySchema = z.object({
  /** The caller's email (or `DELETE` for an account without one), typed to confirm. */
  confirm: z.string().max(320),
})

/**
 * Account deletion (#850), over cookie or `Authorization: Bearer` auth so the
 * web and the native app share one path. Deleting an account is global — it
 * is not scoped to the school on the subdomain.
 *
 * GET  → `{ blockers, confirmationPhrase }` — what stands in the way, and
 *        what the caller must type.
 * POST → `{ deleted: true }`, 409 `{ error: 'blocked', blockers }`, or 400
 *        when the confirmation doesn't match.
 */
export async function GET(req: Request) {
  const user = await getApiUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const blockers = await getAccountDeletionBlockers(user.id)
  return Response.json({ blockers, confirmationPhrase: deletionConfirmationPhrase(user) })
}

export async function POST(req: Request) {
  const user = await getApiUser(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || !isDeletionConfirmed(user, parsed.data.confirm)) {
    return Response.json({ error: 'confirmation_mismatch' }, { status: 400 })
  }

  try {
    const result = await deleteAccount(user.id)
    if (!result.ok) {
      return Response.json({ error: 'blocked', blockers: result.blockers }, { status: 409 })
    }
    return Response.json({ deleted: true })
  } catch (error) {
    console.error('Account deletion failed:', error)
    try {
      const Sentry = await import('@sentry/nextjs')
      Sentry.captureException(error, { extra: { userId: user.id } })
    } catch {}
    return Response.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
