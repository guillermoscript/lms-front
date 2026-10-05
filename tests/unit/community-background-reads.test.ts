import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadNewPosts, getBlockedMembers } = vi.hoisted(() => ({
  loadNewPosts: vi.fn(),
  getBlockedMembers: vi.fn(),
}))
vi.mock('@/app/actions/community', () => ({ loadNewPosts, getBlockedMembers }))

import { GET as newPosts } from '@/app/api/community/new-posts/route'
import { GET as blockedMembers } from '@/app/api/community/blocked-members/route'

beforeEach(() => {
  vi.clearAllMocks()
  loadNewPosts.mockResolvedValue({ success: true, data: { posts: [] } })
  getBlockedMembers.mockResolvedValue({ success: true, data: { members: [] } })
})

describe('community background GET reads', () => {
  it('passes the course cursor and question filter through the existing access gate', async () => {
    const response = await newPosts(new Request('https://school.example/api/community/new-posts?scope=course&courseId=2001&since=2026-10-01T00:00:00Z&questions=unanswered'))
    expect(loadNewPosts).toHaveBeenCalledWith('course', '2026-10-01T00:00:00Z', 2001, 'unanswered')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it.each([
    'scope=other&since=2026-10-01',
    'scope=school&since=invalid',
    'scope=course&since=2026-10-01',
    'scope=course&courseId=-1&since=2026-10-01',
    'scope=course&courseId=1.5&since=2026-10-01',
  ])('rejects invalid query %s before querying protected data', async (query) => {
    const response = await newPosts(new Request(`https://school.example/api/community/new-posts?${query}`))
    expect(response.status).toBe(400)
    expect(loadNewPosts).not.toHaveBeenCalled()
  })

  it('returns an access denial without inventing a successful empty feed', async () => {
    loadNewPosts.mockResolvedValue({ success: false, error: 'Access denied' })
    const response = await newPosts(new Request('https://school.example/api/community/new-posts?scope=school&since=2026-10-01'))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ success: false, error: 'Access denied' })
  })

  it('keeps the authenticated blocked list private and uncached', async () => {
    const response = await blockedMembers()
    expect(getBlockedMembers).toHaveBeenCalledOnce()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ success: true, data: { members: [] } })
  })

  it('does not expose a blocked list when authentication fails', async () => {
    getBlockedMembers.mockResolvedValue({ success: false, error: 'Not authenticated' })
    const response = await blockedMembers()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ success: false, error: 'Not authenticated' })
  })
})
