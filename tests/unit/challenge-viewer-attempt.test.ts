import { describe, expect, it } from 'vitest'
import { loadViewerAttempt } from '@/lib/challenges/viewer-attempt'

function fakeAdmin(row: Record<string, unknown> | null) {
  const calls: Array<[string, unknown]> = []
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (c: string, v: unknown) => (calls.push([c, v]), chain)
  chain.limit = () => chain
  chain.maybeSingle = async () => ({ data: row })
  return { admin: { from: () => chain } as never, calls }
}

const ROW = { score: 81, passed: true, answer: { text: 'mi respuesta' }, feedback: { feedback: 'ok' }, created_at: '2026-10-30T00:00:00Z' }

describe('loadViewerAttempt', () => {
  it('no identity: null, no query', async () => {
    const { admin, calls } = fakeAdmin(ROW)
    expect(await loadViewerAttempt(admin, 't', 1, { userId: null, guestTokenHash: null })).toBeNull()
    expect(calls).toHaveLength(0)
  })
  it('member: scoped by tenant, exercise, official and user_id only', async () => {
    const { admin, calls } = fakeAdmin(ROW)
    const out = await loadViewerAttempt(admin, 't', 1, { userId: 'u1', guestTokenHash: 'g' })
    expect(out).toMatchObject({ score: 81, passed: true, answer: 'mi respuesta' })
    expect(calls).toEqual([['tenant_id', 't'], ['exercise_id', 1], ['is_official', true], ['user_id', 'u1']])
  })
  it('guest: scoped by the cookie hash', async () => {
    const { admin, calls } = fakeAdmin(ROW)
    await loadViewerAttempt(admin, 't', 1, { userId: null, guestTokenHash: 'hash' })
    expect(calls.at(-1)).toEqual(['guest_token_hash', 'hash'])
  })
  it('nothing played: null; malformed answer: empty string', async () => {
    expect(await loadViewerAttempt(fakeAdmin(null).admin, 't', 1, { userId: 'u1', guestTokenHash: null })).toBeNull()
    const out = await loadViewerAttempt(fakeAdmin({ ...ROW, answer: null }).admin, 't', 1, { userId: 'u1', guestTokenHash: null })
    expect(out?.answer).toBe('')
  })
})
