/**
 * The analytics wrapper's only job is to be harmless.
 *
 * `docs/ANALYTICS_OPENPANEL.md` §7 rates "analytics breaking payments" as a
 * 🔴 risk: an `await op.track()` inside a Stripe webhook that hangs or throws
 * is a failed webhook, a lost enrollment and real money. These tests pin the
 * two properties that make that impossible — a throwing transport is swallowed,
 * and no credentials means no transport at all — plus the exclusion predicate
 * that keeps our own traffic out of the funnels (§9.6).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const trackMock = vi.fn()
const identifyMock = vi.fn()
const upsertGroupMock = vi.fn()
const constructorMock = vi.fn()

vi.mock('@openpanel/sdk', () => ({
  OpenPanel: class {
    profileId: string | undefined
    constructor(options: unknown) {
      constructorMock(options)
    }
    track = trackMock
    identify = identifyMock
    upsertGroup = upsertGroupMock
  },
}))

const breadcrumbMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: (...args: unknown[]) => breadcrumbMock(...args),
}))

const ORIGINAL_ENV = { ...process.env }

/** Fresh module registry so the lazy singleton re-reads the env we just set. */
async function loadServer() {
  vi.resetModules()
  return import('@/lib/analytics/server')
}

function withCredentials() {
  process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID = 'test-client-id'
  process.env.OPENPANEL_CLIENT_SECRET = 'test-client-secret'
  // NODE_ENV is `test` under vitest, and the wrapper refuses to emit outside
  // production unless this opt-in is present.
  process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_NON_PRODUCTION = 'true'
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID
  delete process.env.OPENPANEL_CLIENT_SECRET
  delete process.env.NEXT_PUBLIC_OPENPANEL_API_URL
  delete process.env.NEXT_PUBLIC_ANALYTICS_DISABLED
  delete process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_NON_PRODUCTION
  delete process.env.ANALYTICS_GROUPS_DISABLED
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('track() fails open', () => {
  it('resolves without throwing when the transport rejects', async () => {
    withCredentials()
    trackMock.mockRejectedValue(new Error('collector unreachable'))

    const { track } = await loadServer()

    await expect(
      track('payment_succeeded', {
        provider: 'stripe',
        amount_major: 49,
        currency: 'USD',
        is_subscription: false,
      })
    ).resolves.toBeUndefined()

    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(breadcrumbMock).toHaveBeenCalled()
  })

  it('resolves without throwing when the transport throws synchronously', async () => {
    withCredentials()
    trackMock.mockImplementation(() => {
      throw new Error('boom')
    })

    const { track } = await loadServer()

    await expect(track('lesson_completed', { lesson_id: 1 })).resolves.toBeUndefined()
    expect(breadcrumbMock).toHaveBeenCalled()
  })

  it('merges context onto the event instead of trusting the caller', async () => {
    withCredentials()
    trackMock.mockResolvedValue(undefined)

    const { track } = await loadServer()
    await track(
      'course_published',
      { course_id: 7 },
      { userId: 'user-1', tenantId: 'tenant-1', locale: 'es', role: 'admin' }
    )

    expect(trackMock).toHaveBeenCalledWith('course_published', {
      course_id: 7,
      tenant_id: 'tenant-1',
      locale: 'es',
      role: 'admin',
      profileId: 'user-1',
      groups: ['tenant-1'],
    })
  })

  it('backdates via ctx.timestamp so late-settling manual payments land in the right cohort', async () => {
    withCredentials()
    trackMock.mockResolvedValue(undefined)

    const requestedAt = new Date('2026-08-01T10:00:00.000Z')
    const { track } = await loadServer()
    await track('manual_payment_confirmed', {}, { timestamp: requestedAt })

    expect(trackMock.mock.calls[0][1].__timestamp).toBe('2026-08-01T10:00:00.000Z')
  })
})

describe('no-op without credentials', () => {
  it('never constructs a client or calls the transport', async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_NON_PRODUCTION = 'true'
    // No client id, no secret — the state every dev machine and CI runner is in.

    const { track, identifyServer, upsertSchoolGroup } = await loadServer()

    await track('login_succeeded', {})
    await identifyServer('user-1', { role: 'student' })
    await upsertSchoolGroup({ tenantId: 'tenant-1', name: 'Escuela X' })

    expect(constructorMock).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
    expect(identifyMock).not.toHaveBeenCalled()
    expect(upsertGroupMock).not.toHaveBeenCalled()
    expect(breadcrumbMock).not.toHaveBeenCalled()
  })

  it('stays silent when the client id is set but the server secret is not', async () => {
    process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID = 'test-client-id'
    process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_NON_PRODUCTION = 'true'

    const { track } = await loadServer()
    await track('login_succeeded', {})

    expect(constructorMock).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
  })
})

describe('groups fallback', () => {
  it('keeps the flat tenant_id and stops attaching groups once an upsert fails', async () => {
    withCredentials()
    trackMock.mockResolvedValue(undefined)
    upsertGroupMock.mockRejectedValue(new Error('Groups not supported'))

    const { track, upsertSchoolGroup } = await loadServer()

    await expect(
      upsertSchoolGroup({ tenantId: 'tenant-1', name: 'Escuela X' })
    ).resolves.toBeUndefined()

    await track('course_created', { course_id: 1 }, { tenantId: 'tenant-1' })

    const props = trackMock.mock.calls[0][1]
    expect(props.tenant_id).toBe('tenant-1')
    expect(props.groups).toBeUndefined()
  })
})

describe('exclusion predicate', () => {
  it('drops /platform paths, with or without a locale prefix', async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_NON_PRODUCTION = 'true'
    vi.resetModules()
    const { shouldDropEvent, isExcludedPath } = await import('@/lib/analytics/exclusions')

    expect(isExcludedPath('/platform/tenants')).toBe(true)
    expect(isExcludedPath('/en/platform')).toBe(true)
    expect(isExcludedPath('/es/platform/billing?tab=x')).toBe(true)
    expect(isExcludedPath('/en/dashboard/admin')).toBe(false)
    // Not a false positive on a route that merely starts with the same letters.
    expect(isExcludedPath('/en/platform-pricing')).toBe(false)

    expect(shouldDropEvent({ path: '/en/platform/tenants' })).toBe(true)
    expect(shouldDropEvent({ path: '/en/dashboard/student' })).toBe(false)
  })

  it('honors the kill switch, super admins and impersonation', async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ALLOW_NON_PRODUCTION = 'true'
    process.env.NEXT_PUBLIC_ANALYTICS_DISABLED = 'true'
    vi.resetModules()
    let mod = await import('@/lib/analytics/exclusions')
    expect(mod.shouldDropEvent({ path: '/en/dashboard/student' })).toBe(true)

    delete process.env.NEXT_PUBLIC_ANALYTICS_DISABLED
    vi.resetModules()
    mod = await import('@/lib/analytics/exclusions')
    expect(mod.shouldDropEvent({ isSuperAdmin: true })).toBe(true)
    expect(mod.shouldDropEvent({ isImpersonating: true })).toBe(true)
    expect(mod.shouldDropEvent({})).toBe(false)
  })

  it('drops everything outside production unless explicitly opted in', async () => {
    vi.resetModules()
    const { shouldDropEvent } = await import('@/lib/analytics/exclusions')
    expect(shouldDropEvent({ path: '/en/dashboard/student' })).toBe(true)
  })

  it('is enforced by track(), not just by callers remembering to ask', async () => {
    withCredentials()
    trackMock.mockResolvedValue(undefined)

    const { track } = await loadServer()
    await track('plan_changed', {
      from_plan: 'free',
      to_plan: 'pro',
      is_upgrade: true,
    }, { isSuperAdmin: true })

    expect(trackMock).not.toHaveBeenCalled()
  })
})
