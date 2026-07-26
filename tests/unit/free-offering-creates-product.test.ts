/**
 * Free offerings must persist a product, not just a course.
 *
 * The bug: `saveProductCreationWizard`'s free branch called the RPC with
 * `_product: null` and returned `productId: null`, so "create a free product"
 * in the admin wizard created a course and no `products` row — the offering was
 * invisible on /dashboard/admin/products (where the wizard redirects) and had
 * no edit route, since that route is keyed by product_id.
 *
 * These tests pin the action's half of the contract: what it sends to
 * `save_product_creation_wizard` and what it returns. The RPC's half (price 0,
 * manual provider, course link) is enforced in
 * 20260727120000_free_offering_creates_product.sql.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const from = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  verifyAdminAccess: vi.fn().mockResolvedValue(undefined),
  createAdminClient: () => ({ rpc, from }),
}))

vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: vi.fn().mockResolvedValue('00000000-0000-0000-0000-000000000001'),
  getCurrentUserId: vi.fn().mockResolvedValue('11111111-1111-1111-1111-111111111111'),
}))

vi.mock('@/lib/supabase/get-user-role', () => ({ isSuperAdmin: vi.fn().mockResolvedValue(false) }))

vi.mock('@/app/actions/teacher/courses', () => ({
  checkCourseLimit: vi.fn().mockResolvedValue({ canCreate: true, plan: 'pro', limit: 100, currentCount: 1 }),
}))

// A live provider client would demand env credentials; free never needs one.
vi.mock('@/lib/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payments')>()
  return { ...actual, getPaymentProvider: vi.fn(() => { throw new Error('free must not touch a payment provider') }) }
})

import { saveProductCreationWizard } from '@/app/actions/admin/products'

const freeInput = {
  intent: 'publish' as const,
  course: {
    sourceMode: 'new' as const,
    title: 'Intro to Civics',
    description: 'A free course',
    thumbnailUrl: '',
    categoryId: null,
  },
  pricing: { mode: 'free' as const },
  postRegistrationSteps: [],
}

describe('free offering creates a product', () => {
  beforeEach(() => {
    rpc.mockReset()
    from.mockReset()
    // profiles upsert (course author FK) — the only `from` call on this path.
    from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ data: null, error: null }) })
    rpc.mockResolvedValue({ data: { course_id: 77, product_id: 42 }, error: null })
  })

  it('asks the RPC for a product and returns its id', async () => {
    const result = await saveProductCreationWizard(freeInput)

    if (!result.success) throw new Error(`expected success, got: ${result.error}`)
    expect(result.data).toMatchObject({ courseId: 77, productId: 42, pricingMode: 'free', published: true })

    const [fnName, params] = rpc.mock.calls[0]
    expect(fnName).toBe('save_product_creation_wizard')
    expect(params._pricing_mode).toBe('free')
    // The regression: this used to be null, which made the RPC skip the product.
    expect(params._product).not.toBeNull()
  })

  it('never sends a price for a free offering — the RPC pins it to 0', async () => {
    await saveProductCreationWizard({
      ...freeInput,
      // A stale price left over from toggling paid → free must not leak through.
      pricing: { mode: 'free', price: 99, currency: 'eur' } as typeof freeInput.pricing,
    })

    const params = rpc.mock.calls[0][1]
    expect(params._product).toEqual({ currency: 'eur' })
    expect(params._product.price).toBeUndefined()
    expect(params._product.payment_provider).toBeUndefined()
  })

  it('defaults the display currency to usd', async () => {
    await saveProductCreationWizard(freeInput)
    expect(rpc.mock.calls[0][1]._product).toEqual({ currency: 'usd' })
  })

  it('forwards active post-registration steps instead of dropping them', async () => {
    await saveProductCreationWizard({
      ...freeInput,
      postRegistrationSteps: [
        { type: 'whatsapp' as const, title: 'Join the group', description: null, url: 'https://wa.me/123', sortOrder: 0, isActive: true },
        { type: 'link' as const, title: 'Inactive', description: null, url: 'https://example.com', sortOrder: 1, isActive: false },
      ],
    })

    const params = rpc.mock.calls[0][1]
    expect(params._steps).toEqual([
      { type: 'whatsapp', title: 'Join the group', description: null, url: 'https://wa.me/123', sort_order: 0, is_active: true },
    ])
  })

  it('saves a draft as a draft', async () => {
    const result = await saveProductCreationWizard({ ...freeInput, intent: 'draft' })

    expect(rpc.mock.calls[0][1]._intent).toBe('draft')
    if (!result.success) throw new Error(`expected success, got: ${result.error}`)
    expect(result.data?.published).toBe(false)
  })

  it('surfaces an RPC failure instead of reporting success', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'course limit reached' } })

    const result = await saveProductCreationWizard(freeInput)

    if (result.success) throw new Error('expected the RPC error to fail the action')
    expect(result.error).toContain('course limit reached')
  })
})
