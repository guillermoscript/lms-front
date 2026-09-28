import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Issue #870 — `setCommunityNotificationPreference`. The preference itself is
 * enforced by the notification triggers (tests/sql/issue-870-community-
 * notifications.sql §9, §13); this pins what the action writes and through
 * which client: exactly one column of the caller's own row, through RLS.
 */

const state: {
  userId: string | null
  upserts: Array<{ table: string; row: Record<string, unknown>; options: unknown }>
  upsertError: { message: string } | null
} = { userId: 'user-1', upserts: [], upsertError: null }

const adminClient = vi.fn(() => {
  throw new Error('the admin client must not be used')
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: adminClient }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentUserId: async () => state.userId }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>, options: unknown) => {
        state.upserts.push({ table, row, options })
        return { error: state.upsertError }
      },
    }),
  }),
}))

const { setCommunityNotificationPreference } = await import('@/app/actions/notification-preferences')

beforeEach(() => {
  state.userId = 'user-1'
  state.upserts = []
  state.upsertError = null
  adminClient.mockClear()
})

describe('setCommunityNotificationPreference (#870)', () => {
  it('upserts only the replies column of the caller’s row', async () => {
    await expect(setCommunityNotificationPreference('replies', false)).resolves.toEqual({ success: true })
    expect(state.upserts).toEqual([
      {
        table: 'notification_preferences',
        row: { user_id: 'user-1', community_replies: false },
        options: { onConflict: 'user_id' },
      },
    ])
  })

  it('upserts only the prompts column', async () => {
    await setCommunityNotificationPreference('prompts', true)
    expect(state.upserts[0].row).toEqual({ user_id: 'user-1', community_prompts: true })
  })

  it('rejects an unknown key without writing', async () => {
    const result = await setCommunityNotificationPreference('push_enabled' as never, false)
    expect(result).toEqual({ success: false, error: 'Invalid preference' })
    expect(state.upserts).toEqual([])
  })

  it('rejects an inherited property name as a key', async () => {
    const result = await setCommunityNotificationPreference('toString' as never, false)
    expect(result.success).toBe(false)
    expect(state.upserts).toEqual([])
  })

  it('rejects a non-boolean value without writing', async () => {
    const result = await setCommunityNotificationPreference('replies', 'false' as never)
    expect(result).toEqual({ success: false, error: 'Invalid preference' })
    expect(state.upserts).toEqual([])
  })

  it('refuses without a user', async () => {
    state.userId = null
    await expect(setCommunityNotificationPreference('replies', true)).resolves.toEqual({
      success: false,
      error: 'Not authenticated',
    })
    expect(state.upserts).toEqual([])
  })

  it('reports a failed write', async () => {
    state.upsertError = { message: 'permission denied' }
    await expect(setCommunityNotificationPreference('replies', true)).resolves.toEqual({
      success: false,
      error: 'Failed to save preference',
    })
  })

  it('never touches the service role', async () => {
    await setCommunityNotificationPreference('replies', true)
    await setCommunityNotificationPreference('prompts', false)
    expect(adminClient).not.toHaveBeenCalled()
  })
})
