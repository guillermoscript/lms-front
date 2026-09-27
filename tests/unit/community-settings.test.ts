import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The school's community switches (#860, #871).
 *
 * `getCommunitySettings` must read a missing row as ON, like
 * `community_setting_on()` in RLS and in the milestone triggers — otherwise
 * the admin dialog shows a switch OFF that the database treats as ON.
 * `updateCommunitySettings` writes `tenant_settings` with the service role, so
 * it must accept only the known keys and booleans: it used to upsert whatever
 * object the client sent.
 */

const state: {
  rows: { setting_key: string; setting_value: unknown }[]
  upserts: { rows: unknown; options: unknown }[]
  admin: boolean
  readFilter: { tenant?: string; keys?: string[] }
} = { rows: [], upserts: [], admin: true, readFilter: {} }

function from(table: string) {
  expect(table).toBe('tenant_settings')
  const builder = {
    select: () => builder,
    eq: (column: string, value: string) => {
      if (column === 'tenant_id') state.readFilter.tenant = value
      return builder
    },
    in: (_column: string, keys: string[]) => {
      state.readFilter.keys = keys
      return Promise.resolve({ data: state.rows.filter((r) => keys.includes(r.setting_key)), error: null })
    },
    upsert: (rows: unknown, options: unknown) => {
      state.upserts.push({ rows, options })
      return Promise.resolve({ error: null })
    },
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
  verifyAdminAccess: async () => {
    if (!state.admin) throw new Error('Unauthorized')
  },
}))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: async () => 't1',
  getCurrentUserId: async () => 'u1',
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { getCommunitySettings } = await import('@/lib/community/settings')
const { updateCommunitySettings } = await import('@/app/actions/admin/community')

beforeEach(() => {
  state.rows = []
  state.upserts = []
  state.admin = true
  state.readFilter = {}
})

describe('getCommunitySettings', () => {
  it('reads every switch ON when the school has no rows, for this tenant only', async () => {
    expect(await getCommunitySettings('t1')).toEqual({
      studentPostsSchoolFeed: true,
      studentPolls: true,
      milestonePosts: true,
    })
    expect(state.readFilter.tenant).toBe('t1')
    expect(state.readFilter.keys).toEqual([
      'community_student_posts_school_feed',
      'community_student_polls',
      'community_milestone_posts',
    ])
  })

  it('turns off exactly the switch whose row says enabled:false', async () => {
    const cases = [
      ['community_student_posts_school_feed', 'studentPostsSchoolFeed'],
      ['community_student_polls', 'studentPolls'],
      ['community_milestone_posts', 'milestonePosts'],
    ] as const
    for (const [key, field] of cases) {
      state.rows = [{ setting_key: key, setting_value: { enabled: false } }]
      const settings = await getCommunitySettings('t1')
      for (const [, other] of cases) expect(settings[other], `${key} -> ${other}`).toBe(other !== field)
    }
  })

  it('treats a row without enabled:false as ON', async () => {
    state.rows = [
      { setting_key: 'community_milestone_posts', setting_value: {} },
      { setting_key: 'community_student_polls', setting_value: null },
      { setting_key: 'community_student_posts_school_feed', setting_value: { enabled: 'false' } },
    ]
    expect(await getCommunitySettings('t1')).toEqual({
      studentPostsSchoolFeed: true,
      studentPolls: true,
      milestonePosts: true,
    })
  })
})

describe('updateCommunitySettings', () => {
  it('saves the milestone switch for the request tenant', async () => {
    expect(await updateCommunitySettings({ community_milestone_posts: false })).toEqual({ success: true })
    expect(state.upserts).toEqual([
      {
        rows: [{ tenant_id: 't1', setting_key: 'community_milestone_posts', setting_value: { enabled: false } }],
        options: { onConflict: 'tenant_id,setting_key' },
      },
    ])
  })

  it('drops unknown keys and non-boolean values', async () => {
    const forged = {
      community_student_polls: true,
      some_other_setting: false,
      community_milestone_posts: 'no',
      community_student_posts_school_feed: null,
    } as unknown as Parameters<typeof updateCommunitySettings>[0]
    expect((await updateCommunitySettings(forged)).success).toBe(true)
    expect(state.upserts[0].rows).toEqual([
      { tenant_id: 't1', setting_key: 'community_student_polls', setting_value: { enabled: true } },
    ])
  })

  it('refuses an empty or entirely invalid set', async () => {
    expect(await updateCommunitySettings({})).toEqual({ success: false, error: 'No settings provided' })
    const forged = { tenant_plan: true } as unknown as Parameters<typeof updateCommunitySettings>[0]
    expect(await updateCommunitySettings(forged)).toEqual({ success: false, error: 'No settings provided' })
    expect(state.upserts).toHaveLength(0)
  })

  it('refuses a non-admin', async () => {
    state.admin = false
    expect((await updateCommunitySettings({ community_milestone_posts: true })).success).toBe(false)
    expect(state.upserts).toHaveLength(0)
  })
})
