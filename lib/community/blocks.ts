import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The members `userId` has blocked (#846).
 *
 * RLS already hides a blocked author's posts and comments from the blocker,
 * but the web feeds read with the service role, so they filter with this.
 * Blocks are global — they follow the person across schools.
 *
 * A failed read comes back as "no blocks". Callers that must not risk showing
 * a blocked author use `readBlockedAuthorIds` instead.
 */
export async function getBlockedAuthorIds(userId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('community_user_blocks')
    .select('blocked_id')
    .eq('blocker_id', userId)

  return (data ?? []).map((b) => b.blocked_id)
}

/**
 * `getBlockedAuthorIds` that fails closed: `null` when the blocks could not be
 * read, so the caller can show nothing rather than a blocked author's post.
 */
export async function readBlockedAuthorIds(userId: string): Promise<string[] | null> {
  const { data, error } = await createAdminClient()
    .from('community_user_blocks')
    .select('blocked_id')
    .eq('blocker_id', userId)

  if (error) {
    console.error('community_user_blocks read failed:', error.message)
    return null
  }
  return (data ?? []).map((b) => b.blocked_id)
}
