import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `createNotification` inserts with the service role, past RLS — including the
 * RESTRICTIVE policy that keeps community notifications (#870) system-written.
 * Server-action input is not type-checked, so the action itself must refuse a
 * community row and never pass a column the form does not own.
 */

const state: {
  role: string | null
  inserts: Array<Record<string, unknown>>
} = { role: 'admin', inserts: [] }

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/get-user-role', () => ({
  getUserRole: async () => state.role,
  isSuperAdmin: async () => false,
}))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: async () => 'tenant-1',
  getCurrentUserId: async () => 'user-1',
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      expect(table).toBe('notifications')
      return {
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row)
          return { select: () => ({ single: async () => ({ data: { id: 7, ...row }, error: null }) }) }
        },
      }
    },
  }),
}))

const { createNotification } = await import('@/app/actions/admin/notifications')

/** Scheduled, so the action does not go on to dispatch. */
const broadcast = {
  title: 'Exam week',
  content: 'Good luck!',
  notification_type: 'announcement' as const,
  priority: 'normal' as const,
  target_type: 'all' as const,
  delivery_channels: ['in_app'],
  scheduled_for: '2030-01-01T00:00:00.000Z',
}

beforeEach(() => {
  state.role = 'admin'
  state.inserts = []
})

describe('createNotification', () => {
  it('inserts a broadcast with the tenant, the author and a derived status', async () => {
    const result = await createNotification(broadcast)
    expect(result.success).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({
      title: 'Exam week',
      notification_type: 'announcement',
      tenant_id: 'tenant-1',
      created_by: 'user-1',
      status: 'scheduled',
    })
  })

  it('refuses a community notification (#870: those are system-written)', async () => {
    const result = await createNotification({ ...broadcast, notification_type: 'community' } as never)
    expect(result).toEqual({ success: false, error: 'Invalid notification type' })
    expect(state.inserts).toEqual([])
  })

  it('refuses any other type outside the broadcast list', async () => {
    for (const notification_type of ['certificate_issued', undefined, 42]) {
      const result = await createNotification({ ...broadcast, notification_type } as never)
      expect(result.success).toBe(false)
    }
    expect(state.inserts).toEqual([])
  })

  it('never writes a column the request should not own', async () => {
    await createNotification({
      ...broadcast,
      community_post_id: '00000000-0000-0000-0000-0000000000aa',
      status: 'sent',
      created_by: 'someone-else',
      tenant_id: 'other-tenant',
      sent_at: '2020-01-01T00:00:00.000Z',
    } as never)
    expect(state.inserts).toHaveLength(1)
    const row = state.inserts[0]
    expect(row).not.toHaveProperty('community_post_id')
    expect(row).not.toHaveProperty('sent_at')
    expect(row).toMatchObject({ status: 'scheduled', created_by: 'user-1', tenant_id: 'tenant-1' })
  })

  it('refuses a student before any write', async () => {
    state.role = 'student'
    const result = await createNotification(broadcast)
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
    expect(state.inserts).toEqual([])
  })
})
