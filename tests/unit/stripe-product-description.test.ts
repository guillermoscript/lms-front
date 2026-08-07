import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Stripe rejects `description: ''`.
 *
 * It reads an empty string as "unset this parameter" and answers
 * "You passed an empty string for 'description'. … however 'description' cannot
 * be unset." Both product-create paths pass `description ?? ''`
 * (`createProduct` and `saveProductCreationWizard` in
 * `app/actions/admin/products.ts`), so publishing a paid Stripe offering whose
 * course had no description yet failed outright — with a raw Stripe error shown
 * to the admin, and nothing written.
 *
 * Surfaced while verifying #606: it is exactly the step the acceptance criteria
 * ask a reviewer to walk once Connect onboarding is complete. The mapper omits
 * the field when blank rather than forcing every caller to remember.
 */

const { productsCreate } = vi.hoisted(() => ({
  productsCreate: vi.fn(async (params: Record<string, unknown> = {}) => ({
    id: 'prod_test',
    name: params.name,
    description: params.description ?? null,
    metadata: params.metadata ?? {},
  })),
}))

vi.mock('stripe', () => ({
  default: class {
    products = { create: productsCreate }
  },
}))

const { StripePaymentProvider } = await import('@/lib/payments/stripe-provider')

function provider() {
  return new StripePaymentProvider('sk_test_fake')
}

beforeEach(() => productsCreate.mockClear())

describe('StripePaymentProvider.createProduct — description mapping', () => {
  it('omits description entirely when it is an empty string', async () => {
    await provider().createProduct({ name: 'Course', description: '' })
    expect(productsCreate).toHaveBeenCalledTimes(1)
    expect(productsCreate.mock.calls[0][0]).not.toHaveProperty('description')
  })

  it('omits description when it is only whitespace', async () => {
    await provider().createProduct({ name: 'Course', description: '   ' })
    expect(productsCreate.mock.calls[0][0]).not.toHaveProperty('description')
  })

  it('sends a real description through, trimmed', async () => {
    await provider().createProduct({ name: 'Course', description: '  Learn testing  ' })
    expect(productsCreate.mock.calls[0][0]).toMatchObject({
      name: 'Course',
      description: 'Learn testing',
    })
  })
})
