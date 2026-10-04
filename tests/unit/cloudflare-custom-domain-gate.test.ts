/**
 * `createCloudflareSubdomain` is the custom-domain write (#662 gate site for
 * `custom_domain`). Nothing in the app calls it today, which is exactly why it
 * needs a test: a future vanity-domain flow must not be able to reach
 * Cloudflare from a plan that does not include the feature.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanFeatureError } from '@/lib/plans/server'

const requireAdmin = vi.fn()
const requirePlanFeature = vi.fn()

vi.mock('@/lib/actions/utils', () => ({ requireAdmin: (...args: unknown[]) => requireAdmin(...args) }))
vi.mock('@/lib/plans/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/plans/server')>()
  return { ...actual, requirePlanFeature: (...args: unknown[]) => requirePlanFeature(...args) }
})

import { createCloudflareSubdomain } from '@/app/actions/cloudflare'

describe('createCloudflareSubdomain plan gate (#662)', () => {
  const fetchSpy = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchSpy)
    requireAdmin.mockResolvedValue({ tenantId: 'tenant-1', userId: 'user-1' })
    delete process.env.CLOUDFLARE_ZONE_ID
  })

  it('refuses below Business before touching Cloudflare', async () => {
    requirePlanFeature.mockRejectedValue(new PlanFeatureError('custom_domain', 'free', 'business'))

    await expect(createCloudflareSubdomain('my-school')).rejects.toBeInstanceOf(PlanFeatureError)
    expect(requirePlanFeature).toHaveBeenCalledWith('tenant-1', 'custom_domain')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('requires an admin before it even asks about the plan', async () => {
    requireAdmin.mockRejectedValue(new Error('Unauthorized'))

    await expect(createCloudflareSubdomain('my-school')).rejects.toThrow('Unauthorized')
    expect(requirePlanFeature).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a malformed subdomain once the plan allows it', async () => {
    requirePlanFeature.mockResolvedValue({ slug: 'business', name: 'Business', features: {} })

    await expect(createCloudflareSubdomain('Bad Slug!')).resolves.toEqual({
      success: false,
      reason: 'Invalid subdomain',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('stops safely when Cloudflare is not configured', async () => {
    requirePlanFeature.mockResolvedValue({ slug: 'business', name: 'Business', features: {} })

    await expect(createCloudflareSubdomain('my-school')).resolves.toEqual({
      success: false,
      reason: 'Missing ENV vars',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
