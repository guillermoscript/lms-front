import { createAdminClient } from '@/lib/supabase/admin'
import { COMMUNITY_SETTING_KEYS, type CommunitySettingField } from '@/lib/community/setting-keys'

export type CommunitySettings = Record<CommunitySettingField, boolean>

/**
 * The school's community switches (#860, #871). A missing row means ON — the
 * same reading as `community_setting_on()` in RLS and in the milestone
 * triggers, so the UI never hides something the database would allow.
 */
export async function getCommunitySettings(tenantId: string): Promise<CommunitySettings> {
  const { data } = await createAdminClient()
    .from('tenant_settings')
    .select('setting_key, setting_value')
    .eq('tenant_id', tenantId)
    .in('setting_key', Object.values(COMMUNITY_SETTING_KEYS))

  const off = (key: string) =>
    (data ?? []).some(
      (row) => row.setting_key === key && (row.setting_value as { enabled?: unknown } | null)?.enabled === false
    )

  return {
    studentPostsSchoolFeed: !off(COMMUNITY_SETTING_KEYS.studentPostsSchoolFeed),
    studentPolls: !off(COMMUNITY_SETTING_KEYS.studentPolls),
    milestonePosts: !off(COMMUNITY_SETTING_KEYS.milestonePosts),
  }
}
