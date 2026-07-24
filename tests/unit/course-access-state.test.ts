import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCourseAccessState } from '@/lib/services/course-access'

/**
 * `has_course_access()` collapses "you never bought this" and "your school is
 * past its access cutoff" into the same `false` (#494/#509). These tests pin
 * the rule that tells them apart: an active, unexpired entitlement that the
 * RPC still refuses can only have been refused by the tenant cutoff.
 */

interface StubOpts {
  rpcResult: boolean
  entitlements: Array<{ expires_at: string | null }>
}

function stubClient({ rpcResult, entitlements }: StubOpts): {
  client: SupabaseClient
  entitlementQueries: number
} {
  const state = { entitlementQueries: 0 }

  const client = {
    rpc: async () => ({ data: rpcResult, error: null }),
    from: () => {
      state.entitlementQueries += 1
      const builder = {
        select: () => builder,
        eq: () => builder,
        then: (resolve: (v: { data: unknown }) => unknown) =>
          resolve({ data: entitlements }),
      }
      return builder
    },
  } as unknown as SupabaseClient

  return {
    client,
    get entitlementQueries() {
      return state.entitlementQueries
    },
  }
}

const FUTURE = '2999-01-01T00:00:00.000Z'
const PAST = '2000-01-01T00:00:00.000Z'

describe('resolveCourseAccessState', () => {
  it('grants when the RPC says yes, without querying entitlements', async () => {
    const stub = stubClient({ rpcResult: true, entitlements: [] })
    await expect(resolveCourseAccessState(stub.client, 'user-1', 1001)).resolves.toBe(
      'granted'
    )
    expect(stub.entitlementQueries).toBe(0)
  })

  it('denies when the RPC says no and there is no entitlement at all', async () => {
    const stub = stubClient({ rpcResult: false, entitlements: [] })
    await expect(resolveCourseAccessState(stub.client, 'user-1', 1001)).resolves.toBe(
      'denied'
    )
  })

  it('reports suspended when a live entitlement exists but the RPC still refuses', async () => {
    // The only condition has_course_access() checks that this query does not
    // is tenants.access_cutoff_at — so this is the school being cut off (#494).
    const stub = stubClient({
      rpcResult: false,
      entitlements: [{ expires_at: null }],
    })
    await expect(resolveCourseAccessState(stub.client, 'user-1', 1001)).resolves.toBe(
      'suspended'
    )
  })

  it('treats a not-yet-expired entitlement as live', async () => {
    const stub = stubClient({
      rpcResult: false,
      entitlements: [{ expires_at: FUTURE }],
    })
    await expect(resolveCourseAccessState(stub.client, 'user-1', 1001)).resolves.toBe(
      'suspended'
    )
  })

  it('does not call an expired entitlement a suspension', async () => {
    // An expired subscription is a plain denial: the student should be sent to
    // the dashboard to renew, not told their school is suspended.
    const stub = stubClient({
      rpcResult: false,
      entitlements: [{ expires_at: PAST }],
    })
    await expect(resolveCourseAccessState(stub.client, 'user-1', 1001)).resolves.toBe(
      'denied'
    )
  })

  it('one live entitlement among expired ones is still a suspension', async () => {
    const stub = stubClient({
      rpcResult: false,
      entitlements: [{ expires_at: PAST }, { expires_at: FUTURE }],
    })
    await expect(resolveCourseAccessState(stub.client, 'user-1', 1001)).resolves.toBe(
      'suspended'
    )
  })
})
