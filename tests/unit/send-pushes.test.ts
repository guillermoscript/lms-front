import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  EXPO_CHUNK_SIZE,
  MAX_NOTIFICATIONS_PER_RUN,
  sendPendingPushes,
  truncatePushBody,
  type ClaimedPush,
} from '@/lib/notifications/push'

/**
 * Issue #835. The claim itself (atomic marking, opt-out, stale rows) is SQL —
 * see tests/sql/issue-835-claim-pending-pushes.sql. These pin what the app does
 * with a claim: batching, the message shape, pruning, and that nothing is sent
 * twice because every send comes from a claim.
 */

function push(overrides: Partial<ClaimedPush> = {}): ClaimedPush {
  return {
    notification_id: 1,
    title: 'New lesson',
    content: 'Lesson 3 is out',
    priority: 'normal',
    url: '/dashboard/student/courses/1',
    recipients: 1,
    tokens: ['ExponentPushToken[a]'],
    ...overrides,
  }
}

/** Fake admin client: rpc returns the queued claims once, then nothing. */
function fakeAdmin(claims: ClaimedPush[]) {
  const queue = [claims]
  const pruned: string[][] = []
  const rpc = vi.fn(async () => ({ data: queue.shift() ?? [], error: null }))
  const admin = {
    rpc,
    from: vi.fn((table: string) => {
      expect(table).toBe('device_push_tokens')
      return {
        delete: () => ({
          in: async (column: string, values: string[]) => {
            expect(column).toBe('token')
            pruned.push(values)
            return { error: null }
          },
        }),
      }
    }),
  } as unknown as SupabaseClient
  return { admin, rpc, pruned }
}

/** Expo stub: answers one `ok` ticket per token unless a token is in `dead`. */
function fakeExpo(dead: string[] = []) {
  const bodies: Array<Record<string, unknown> & { to: string[] }> = []
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string)
    bodies.push(body)
    const data = body.to.map((token: string) =>
      dead.includes(token)
        ? { status: 'error', message: `${token} is not registered`, details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: `ticket-${token}` }
    )
    return new Response(JSON.stringify({ data }), { status: 200 })
  })
  return { fetchMock, bodies }
}

describe('sendPendingPushes (#835)', () => {
  it('claims a bounded batch and sends the message the app expects', async () => {
    const { admin, rpc } = fakeAdmin([push({ priority: 'urgent' })])
    const { fetchMock, bodies } = fakeExpo()

    const result = await sendPendingPushes(admin, { fetch: fetchMock as typeof fetch, expoUrl: 'http://stub/push' })

    expect(rpc).toHaveBeenCalledWith('claim_pending_pushes', {
      _max_notifications: MAX_NOTIFICATIONS_PER_RUN,
      _max_age: '1 day',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('http://stub/push')
    expect(bodies[0]).toEqual({
      to: ['ExponentPushToken[a]'],
      title: 'New lesson',
      body: 'Lesson 3 is out',
      data: { notification_id: 1, url: '/dashboard/student/courses/1' },
      sound: 'default',
      priority: 'high',
    })
    expect(result).toMatchObject({ notifications: 1, recipients: 1, devices: 1, sent: 1, pruned_tokens: 0, errors: [] })
  })

  it('batches tokens in chunks of 100', async () => {
    const tokens = Array.from({ length: 250 }, (_, i) => `ExponentPushToken[${i}]`)
    const { admin } = fakeAdmin([push({ tokens, recipients: 250 })])
    const { fetchMock, bodies } = fakeExpo()

    const result = await sendPendingPushes(admin, { fetch: fetchMock as typeof fetch })

    expect(bodies.map((b) => b.to.length)).toEqual([EXPO_CHUNK_SIZE, EXPO_CHUNK_SIZE, 50])
    expect(bodies.flatMap((b) => b.to)).toEqual(tokens)
    expect(result.sent).toBe(250)
  })

  it('sends nothing for a claim with no tokens (opted out or no device) but still counts it', async () => {
    const { admin } = fakeAdmin([push({ tokens: [], recipients: 3 })])
    const { fetchMock } = fakeExpo()

    const result = await sendPendingPushes(admin, { fetch: fetchMock as typeof fetch })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ notifications: 1, recipients: 3, devices: 0, sent: 0 })
  })

  it('prunes DeviceNotRegistered tokens and keeps the live ones', async () => {
    const { admin, pruned } = fakeAdmin([push({ tokens: ['ExponentPushToken[live]', 'ExponentPushToken[dead]'] })])
    const { fetchMock } = fakeExpo(['ExponentPushToken[dead]'])

    const result = await sendPendingPushes(admin, { fetch: fetchMock as typeof fetch })

    expect(pruned).toEqual([['ExponentPushToken[dead]']])
    expect(result).toMatchObject({ sent: 1, pruned_tokens: 1 })
    expect(result.errors).toEqual(['ExponentPushToken[dead] is not registered'])
  })

  it('keeps going past a failed Expo request', async () => {
    const { admin } = fakeAdmin([push({ notification_id: 1 }), push({ notification_id: 2, tokens: ['ExponentPushToken[b]'] })])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockRejectedValueOnce(new Error('network down'))

    const result = await sendPendingPushes(admin, { fetch: fetchMock as typeof fetch })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.sent).toBe(0)
    expect(result.errors).toEqual(['notification 1: Expo 500 boom', 'notification 2: network down'])
  })

  it('never sends twice: a second run with nothing left to claim sends nothing', async () => {
    const { admin, rpc } = fakeAdmin([push()])
    const { fetchMock } = fakeExpo()

    await sendPendingPushes(admin, { fetch: fetchMock as typeof fetch })
    const second = await sendPendingPushes(admin, { fetch: fetchMock as typeof fetch })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(second).toMatchObject({ notifications: 0, sent: 0 })
  })

  it('throws when the claim fails, so the route answers 500', async () => {
    const admin = { rpc: async () => ({ data: null, error: new Error('rpc failed') }) } as unknown as SupabaseClient
    await expect(sendPendingPushes(admin, { fetch: vi.fn() as unknown as typeof fetch })).rejects.toThrow('rpc failed')
  })

  it('cuts a body longer than 170 characters to 167 + "..."', () => {
    expect(truncatePushBody('x'.repeat(170))).toBe('x'.repeat(170))
    expect(truncatePushBody('x'.repeat(171))).toBe(`${'x'.repeat(167)}...`)
  })
})
