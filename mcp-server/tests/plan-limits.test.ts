/**
 * The MCP server's side of the plan-limit contract (#658 / #296 Phase 5).
 *
 * `lms_create_course` and the status un-archive path call
 * `courseLimitHeadroomError` before writing and map the trigger's `LM001` with
 * `isPlanLimitError` after. Neither is reachable from Playwright without an
 * OAuth session, so the pure logic is pinned here.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PLAN_LIMIT_SQLSTATE,
  courseLimitHeadroomError,
  isPlanLimitError,
  planLimitMessage,
} from '../src/plan-limits.js'

function fakeClient(rpcResult: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('isPlanLimitError', () => {
  it('recognises the trigger SQLSTATE', () => {
    expect(isPlanLimitError({ code: PLAN_LIMIT_SQLSTATE, message: 'anything' })).toBe(true)
  })

  it('recognises the message when the code was lost in transit', () => {
    expect(isPlanLimitError({ message: 'plan_limit_exceeded:courses' })).toBe(true)
    expect(isPlanLimitError(new Error('plan_limit_exceeded:students'))).toBe(true)
  })

  it('ignores every other error', () => {
    expect(isPlanLimitError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isPlanLimitError(null)).toBe(false)
    expect(isPlanLimitError('plan_limit_exceeded:courses')).toBe(false)
  })
})

describe('courseLimitHeadroomError', () => {
  it('refuses at the cap with the usage in the message', async () => {
    const { client, rpc } = fakeClient({
      data: { courses: 5, students: 3, max_courses: 5, max_students: 50 },
    })

    const message = await courseLimitHeadroomError(client, 'tenant-1')

    expect(rpc).toHaveBeenCalledWith('get_tenant_plan_usage', { _tenant_id: 'tenant-1' })
    expect(message).toContain('limited to 5 courses')
    expect(message).toContain('currently has 5')
    expect(message).toContain('Archive a course')
  })

  it('allows a write with headroom', async () => {
    const { client } = fakeClient({ data: { courses: 4, max_courses: 5 } })
    expect(await courseLimitHeadroomError(client, 'tenant-1')).toBeNull()
  })

  it('treats -1 and a missing limit as unlimited', async () => {
    expect(
      await courseLimitHeadroomError(fakeClient({ data: { courses: 999, max_courses: -1 } }).client, 't'),
    ).toBeNull()
    expect(await courseLimitHeadroomError(fakeClient({ data: { courses: 999 } }).client, 't')).toBeNull()
  })

  it('defers to the trigger when usage cannot be read', async () => {
    const { client } = fakeClient({ error: { message: 'permission denied' } })
    expect(await courseLimitHeadroomError(client, 'tenant-1')).toBeNull()
  })
})

describe('planLimitMessage', () => {
  it('still explains the refusal when usage is unavailable', async () => {
    const { client } = fakeClient({ error: { message: 'nope' } })
    const message = await planLimitMessage(client, 'tenant-1', 'students')
    expect(message).toContain('does not allow more students')
  })

  it('names the student cap after an LM001 on tenant_users', async () => {
    const { client } = fakeClient({ data: { students: 50, max_students: 50, courses: 1, max_courses: 5 } })
    const message = await planLimitMessage(client, 'tenant-1', 'students')
    expect(message).toContain('limited to 50 students')
    expect(message).toContain('upgrade the plan')
  })
})
