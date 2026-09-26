import { createAdminClient } from '@/lib/supabase/admin'

export type CommunitySettings = {
  studentPostsSchoolFeed: boolean
  studentPolls: boolean
}

/**
 * The school's community switches (#860). A missing row means ON — the same
 * reading as `community_setting_on()` in RLS, so the UI never hides something
 * the database would allow.
 */
export async function getCommunitySettings(tenantId: string): Promise<CommunitySettings> {
  const { data } = await createAdminClient()
    .from('tenant_settings')
    .select('setting_key, setting_value')
    .eq('tenant_id', tenantId)
    .in('setting_key', ['community_student_posts_school_feed', 'community_student_polls'])

  const off = (key: string) =>
    (data ?? []).some(
      (row) => row.setting_key === key && (row.setting_value as { enabled?: unknown } | null)?.enabled === false
    )

  return {
    studentPostsSchoolFeed: !off('community_student_posts_school_feed'),
    studentPolls: !off('community_student_polls'),
  }
}
