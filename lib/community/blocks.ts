import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The members `userId` has blocked (#846).
 *
 * RLS already hides a blocked author's posts and comments from the blocker,
 * but the web feeds read with the service role, so they filter with this.
 * Blocks are global — they follow the person across schools.
 */
export async function getBlockedAuthorIds(userId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('community_user_blocks')
    .select('blocked_id')
    .eq('blocker_id', userId)

  return (data ?? []).map((b) => b.blocked_id)
}
