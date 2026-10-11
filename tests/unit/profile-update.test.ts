import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 'student-1' as string | null,
  row: { id: 'student-1' } as { id: string } | null,
  error: null as { code: string } | null,
  update: vi.fn(),
  eq: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentUserId: async () => state.userId }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      update: (payload: unknown) => {
        state.update(payload)
        return {
          eq: (...args: unknown[]) => {
            state.eq(...args)
            return {
              error: state.error,
              select: () => ({ maybeSingle: async () => ({ data: state.row, error: state.error }) }),
            }
          },
        }
      },
    }),
  }),
}))

import { revalidatePath } from 'next/cache'
import { updateProfile, updateShareMilestones } from '@/app/[locale]/dashboard/student/profile/actions'

beforeEach(() => {
  vi.clearAllMocks()
  state.userId = 'student-1'
  state.row = { id: 'student-1' }
  state.error = null
})

function form(username = 'student') {
  const data = new FormData()
  data.set('username', username)
  data.set('full_name', '  Updated Student  ')
  data.set('website', '')
  data.set('bio', '  My bio  ')
  return data
}

describe('profile update', () => {
  it('does not claim success when RLS or a missing profile matches no row', async () => {
    state.row = null
    expect(await updateProfile(form())).toEqual({ success: false, code: 'unknown' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('updates only the caller and revalidates localized profile and teacher settings', async () => {
    expect(await updateProfile(form())).toEqual({ success: true })
    expect(state.update).toHaveBeenCalledWith({ full_name: 'Updated Student', username: 'student', website: null, bio: 'My bio' })
    expect(state.eq).toHaveBeenCalledWith('id', 'student-1')
    expect(revalidatePath).toHaveBeenCalledWith('/[locale]/dashboard/student/profile', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/[locale]/dashboard/settings', 'page')
  })
  it('rejects expired sessions without writing', async () => {
    state.userId = null
    expect(await updateProfile(form())).toEqual({ success: false, code: 'unauthorized' })
    expect(state.update).not.toHaveBeenCalled()
  })
  it('clears an optional username using NULL', async () => {
    expect(await updateProfile(form(' '))).toEqual({ success: true })
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ username: null }))
  })
  it('keeps username validation and duplicate errors actionable', async () => {
    expect(await updateProfile(form('ab'))).toEqual({ success: false, field: 'username', code: 'username_too_short' })
    expect(state.update).not.toHaveBeenCalled()
    state.error = { code: '23505' }
    expect(await updateProfile(form())).toEqual({ success: false, field: 'username', code: 'username_taken' })
  })
  it('also refreshes the localized profile after a milestone preference update', async () => {
    expect(await updateShareMilestones(false)).toEqual({ success: true })
    expect(revalidatePath).toHaveBeenCalledWith('/[locale]/dashboard/student/profile', 'page')
  })
})
