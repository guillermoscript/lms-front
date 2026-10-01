/**
 * `POST /api/account/delete` is Bearer-only (#891): a session cookie must not
 * authenticate it, or a cross-site `text/plain` POST deletes the victim.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  bearerUser: null as { id: string; email: string } | null,
  cookieUser: { id: 'cookie-user', email: 'v@example.com' } as { id: string; email: string } | null,
  deleted: [] as string[],
}))

vi.mock('@/lib/supabase/api-auth', () => ({
  getBearerUser: () => Promise.resolve(state.bearerUser),
  getApiUser: () => Promise.resolve(state.bearerUser ?? state.cookieUser),
}))
vi.mock('@/lib/account/delete-account', () => ({
  deleteAccount: (id: string) => {
    state.deleted.push(id)
    return Promise.resolve({ ok: true })
  },
  deletionConfirmationPhrase: (u: { email: string }) => u.email,
  getAccountDeletionBlockers: () => Promise.resolve([]),
  isDeletionConfirmed: (u: { email: string }, c: string) => c.toLowerCase() === u.email.toLowerCase(),
}))

import { POST } from '@/app/api/account/delete/route'

const post = () =>
  POST(
    new Request('http://t/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ confirm: 'v@example.com' }),
    }),
  )

beforeEach(() => {
  state.bearerUser = null
  state.deleted = []
})

describe('POST /api/account/delete', () => {
  it('401s a cookie-only request and deletes nothing', async () => {
    const res = await post()
    expect(res.status).toBe(401)
    expect(state.deleted).toEqual([])
  })

  it('deletes for a Bearer caller who confirms', async () => {
    state.bearerUser = { id: 'u1', email: 'v@example.com' }
    const res = await post()
    expect(res.status).toBe(200)
    expect(state.deleted).toEqual(['u1'])
  })
})
