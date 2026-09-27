/**
 * The school's community switches, as `tenant_settings.setting_key` values
 * (#860, #871). Client-safe: the settings dialog builds its switches from this
 * map and `updateCommunitySettings` accepts nothing else. RLS reads the same
 * keys through `community_setting_on()`; a missing row means ON everywhere.
 */
export const COMMUNITY_SETTING_KEYS = {
  studentPostsSchoolFeed: 'community_student_posts_school_feed',
  studentPolls: 'community_student_polls',
  milestonePosts: 'community_milestone_posts',
} as const

export type CommunitySettingField = keyof typeof COMMUNITY_SETTING_KEYS
export type CommunitySettingKey = (typeof COMMUNITY_SETTING_KEYS)[CommunitySettingField]

const ALLOWED_KEYS = new Set<string>(Object.values(COMMUNITY_SETTING_KEYS))

export function isCommunitySettingKey(key: string): key is CommunitySettingKey {
  return ALLOWED_KEYS.has(key)
}
