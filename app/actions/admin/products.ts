'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getPaymentProvider, type Currency, type PaymentProvider } from '@/lib/payments'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { checkCourseLimit } from '@/app/actions/teacher/courses'
import { getProductCreationReadiness } from '@/lib/admin/product-creation/validation'
import type {
  ProductCreationWizardInput,
  ProductCreationWizardResult,
  ProductPostRegistrationStepInput,
} from '@/lib/admin/product-creation/types'

interface ProductFormData {
  name: string
  description: string
  price: number
  currency: 'usd' | 'eur'
  image?: string
  courseIds: number[]
  paymentProvider?: PaymentProvider
}

interface Product {
  product_id: number
  name: string
  description: string
  price: number
  currency: string
  image?: string
  status: string
  payment_provider: string
  provider_product_id?: string
  provider_price_id?: string
}

/**
 * Shapes the active post-registration steps into the JSONB rows the
 * `save_product_creation_wizard` RPC consumes. tenant_id / product_id are
 * supplied by the RPC, so they are intentionally omitted here.
 */
function buildPostRegistrationStepRows(steps: ProductPostRegistrationStepInput[]) {
  return steps
    .filter((step) => step.isActive)
    .map((step, index) => ({
      type: step.type,
      title: step.title.trim(),
      description: step.description?.trim() || null,
      url: step.type === 'text' ? null : step.url?.trim() || null,
      sort_order: index,
      is_active: true,
    }))
}

function revalidateOfferingPaths() {
  revalidatePath('/dashboard/admin/products')
  revalidatePath('/dashboard/admin/monetization')
  revalidatePath('/dashboard/teacher/courses')
  revalidatePath('/courses')
  revalidatePath('/products')
  revalidatePath('/dashboard/student')
}

/**
 * Best-effort rollback of provider objects created during a save that then
 * failed to commit to the database. Archives are no-ops for the manual provider.
 */
async function compensateProviderObjects(
  provider: ReturnType<typeof getPaymentProvider>,
  objects: Array<{ productId?: string; priceId?: string }>
) {
  // Archive prices before their products (reverse of creation order).
  for (const object of [...objects].reverse()) {
    try {
      if (object.priceId) await provider.archivePrice(object.priceId)
      if (object.productId) await provider.archiveProduct(object.productId)
    } catch (cleanupError) {
      console.error('Failed to roll back provider object after save error:', cleanupError)
    }
  }
}

/**
 * Creates a new product with payment provider integration
 * Supports multiple payment providers (Stripe, PayPal, Binance, etc.)
 */
export async function createProduct(formData: ProductFormData): Promise<ActionResult<Product>> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()

    // Validate input
    if (!formData.name || formData.name.trim().length === 0) {
      throw new Error('Product name is required')
    }

    if (formData.price <= 0) {
      throw new Error('Price must be greater than 0')
    }

    if (!formData.courseIds || formData.courseIds.length === 0) {
      throw new Error('At least one course must be selected')
    }

    // Get payment provider (defaults to Stripe)
    const provider = getPaymentProvider(formData.paymentProvider || 'stripe')

    // 1. Create product in payment provider
    const paymentProduct = await provider.createProduct({
      name: formData.name.trim(),
      description: formData.description?.trim() || '',
      images: formData.image ? [formData.image] : [],
      metadata: {
        created_by: 'admin',
        created_at: new Date().toISOString()
      }
    })

    // 2. Create price in payment provider
    const paymentPrice = await provider.createPrice({
      productId: paymentProduct.id,
      amount: provider.convertAmount(formData.price, 'major'), // Convert to base units
      currency: formData.currency,
      type: 'one_time',
      metadata: {
        product_name: formData.name
      }
    })

    // 3. Insert product into database
    const adminClient = createAdminClient()
    const { data: product, error: insertError } = await adminClient
      .from('products')
      .insert({
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        price: formData.price,
        currency: formData.currency,
        image: formData.image || null,
        payment_provider: provider.provider,
        provider_product_id: paymentProduct.id,
        provider_price_id: paymentPrice.id,
        status: 'active',
        tenant_id: tenantId
      })
      .select()
      .single()

    if (insertError) throw insertError

    // 4. Link courses to product
    const courseLinks = formData.courseIds.map(courseId => ({
      product_id: product.product_id,
      course_id: courseId,
      tenant_id: tenantId,
    }))

    const { error: linkError } = await adminClient
      .from('product_courses')
      .insert(courseLinks)

    if (linkError) throw linkError

    revalidatePath('/dashboard/admin/products')
    revalidatePath('/dashboard/student')

    return { success: true, data: product }

  } catch (error) {
    console.error('Create product failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create product'
    }
  }
}

/**
 * Updates an existing product
 */
export async function updateProduct(
  productId: number,
  formData: ProductFormData
): Promise<ActionResult<Product>> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!productId) {
      throw new Error('Product ID is required')
    }

    if (!formData.name || formData.name.trim().length === 0) {
      throw new Error('Product name is required')
    }

    if (formData.price <= 0) {
      throw new Error('Price must be greater than 0')
    }

    const adminClient = createAdminClient()

    // Get existing product and verify tenant ownership
    const { data: existingProduct, error: fetchError } = await adminClient
      .from('products')
      .select('*')
      .eq('product_id', productId)
      .single()

    if (fetchError || !existingProduct) {
      throw new Error('Product not found')
    }

    // Verify product belongs to tenant (unless super_admin)
    if (!isSuperAdminUser && existingProduct.tenant_id !== tenantId) {
      throw new Error('Product not found or access denied')
    }

    // Get payment provider
    const providerType = existingProduct.payment_provider as PaymentProvider || 'stripe'
    const provider = getPaymentProvider(providerType)

    // Update product in payment provider
    if (existingProduct.provider_product_id) {
      await provider.updateProduct(existingProduct.provider_product_id, {
        name: formData.name.trim(),
        description: formData.description?.trim() || '',
        images: formData.image ? [formData.image] : []
      })

      // If price changed, create new price
      if (formData.price !== existingProduct.price || formData.currency !== existingProduct.currency) {
        const newPrice = await provider.createPrice({
          productId: existingProduct.provider_product_id,
          amount: provider.convertAmount(formData.price, 'major'),
          currency: formData.currency,
          type: 'one_time',
          metadata: {
            product_name: formData.name
          }
        })

        // Archive old price
        if (existingProduct.provider_price_id) {
          await provider.archivePrice(existingProduct.provider_price_id)
        }

        // Update product with new price ID
        const { data: product, error: updateError } = await adminClient
          .from('products')
          .update({
            name: formData.name.trim(),
            description: formData.description?.trim() || null,
            price: formData.price,
            currency: formData.currency,
            image: formData.image || null,
            provider_price_id: newPrice.id,
          })
          .eq('product_id', productId)
          .eq('tenant_id', tenantId)
          .select()
          .single()

        if (updateError) throw updateError

        // Update course links — delete by product_id only (it's the PK)
        await adminClient
          .from('product_courses')
          .delete()
          .eq('product_id', productId)

        if (formData.courseIds.length > 0) {
          const courseLinks = formData.courseIds.map(courseId => ({
            product_id: productId,
            course_id: courseId,
            tenant_id: tenantId,
          }))

          await adminClient.from('product_courses').insert(courseLinks)
        }

        revalidatePath('/dashboard/admin/products')
        revalidatePath('/dashboard/student')

        return { success: true, data: product }
      }
    }

    // Update product without price change
    const { data: product, error: updateError } = await adminClient
      .from('products')
      .update({
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        image: formData.image || null,
      })
      .eq('product_id', productId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (updateError) throw updateError

    // Update course links — delete by product_id only (it's the PK)
    await adminClient
      .from('product_courses')
      .delete()
      .eq('product_id', productId)

    if (formData.courseIds.length > 0) {
      const courseLinks = formData.courseIds.map(courseId => ({
        product_id: productId,
        course_id: courseId,
        tenant_id: tenantId,
      }))

      await adminClient.from('product_courses').insert(courseLinks)
    }

    revalidatePath('/dashboard/admin/products')
    revalidatePath('/dashboard/student')

    return { success: true, data: product }

  } catch (error) {
    console.error('Update product failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update product'
    }
  }
}

/**
 * Saves the guided admin offering flow.
 * Free offerings persist only a course. Paid offerings persist course + product + product_courses + post-registration steps.
 */
export async function saveProductCreationWizard(
  input: ProductCreationWizardInput
): Promise<ActionResult<ProductCreationWizardResult>> {
  try {
    await verifyAdminAccess()

    const readiness = getProductCreationReadiness(input)
    if (input.intent === 'publish' && !readiness.canPublish) {
      throw new Error(readiness.issues[0]?.message || 'Offering is not ready to publish')
    }
    if (input.intent === 'draft' && !readiness.canSaveDraft) {
      throw new Error(readiness.issues[0]?.message || 'Offering is not ready to save')
    }

    const tenantId = await getCurrentTenantId()
    const adminClient = createAdminClient()
    const userId = await getCurrentUserId()

    if (!userId) {
      throw new Error('Not authenticated')
    }

    // Course-limit gate only applies to brand-new courses (needs plan features,
    // so it stays in the action rather than the SQL transaction).
    if (input.course.sourceMode === 'new') {
      const limitCheck = await checkCourseLimit()
      if (!limitCheck.canCreate) {
        throw new Error(
          `Your ${limitCheck.plan} plan is limited to ${limitCheck.limit} courses. You currently have ${limitCheck.currentCount} courses.`
        )
      }

      // The course FK requires the author's profile to exist.
      await adminClient
        .from('profiles')
        .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
    }

    const coursePayload = {
      title: input.course.title.trim(),
      description: input.course.description?.trim() || null,
      thumbnail_url: input.course.thumbnailUrl?.trim() || null,
      category_id: input.course.categoryId ?? null,
    }

    const productId = input.productId ?? null

    // ---- FREE: no payment provider work, single-tx RPC handles cleanup ------
    if (input.pricing.mode === 'free') {
      // The RPC soft-archives the product row but cannot touch the external
      // provider, so archive its objects here first (no-op for manual).
      if (productId) {
        const { data: productToArchive } = await adminClient
          .from('products')
          .select('payment_provider, provider_product_id, provider_price_id')
          .eq('product_id', productId)
          .eq('tenant_id', tenantId)
          .single()

        if (productToArchive?.provider_product_id && productToArchive.provider_price_id) {
          const archiveProvider = getPaymentProvider(
            (productToArchive.payment_provider as PaymentProvider) || 'manual'
          )
          await archiveProvider.archivePrice(productToArchive.provider_price_id)
          await archiveProvider.archiveProduct(productToArchive.provider_product_id)
        }
      }

      const { data: rpcResult, error: rpcError } = await adminClient.rpc(
        'save_product_creation_wizard',
        {
          _tenant_id: tenantId,
          _author_id: userId,
          _intent: input.intent,
          _source_mode: input.course.sourceMode,
          _existing_course_id: input.course.existingCourseId ?? null,
          _course: coursePayload,
          _pricing_mode: 'free',
          _product_id: productId,
          _product: null,
          _steps: null,
        }
      )

      if (rpcError) throw new Error(rpcError.message)

      revalidateOfferingPaths()

      return {
        success: true,
        data: {
          courseId: (rpcResult as { course_id: number }).course_id,
          productId: null,
          pricingMode: 'free',
          published: input.intent === 'publish',
        },
      }
    }

    // ---- PAID: resolve provider objects, then commit everything in one tx ----
    const provider = getPaymentProvider(input.pricing.paymentProvider || 'manual')
    const nextPrice = input.pricing.price!
    const nextCurrency = input.pricing.currency! as Currency

    // Objects newly created in THIS call — archived as compensation if the DB
    // transaction below fails, so a failed save never leaks live Stripe objects.
    const createdProviderObjects: Array<{ productId?: string; priceId?: string }> = []
    // Objects superseded by this call — archived only AFTER the DB commit.
    const staleProviderObjects: Array<{
      provider: PaymentProvider
      productId?: string
      priceId?: string
    }> = []

    let providerProductId: string | null = null
    let providerPriceId: string | null = null

    if (productId) {
      const { data: existingProduct, error: productFetchError } = await adminClient
        .from('products')
        .select('*')
        .eq('product_id', productId)
        .eq('tenant_id', tenantId)
        .single()

      if (productFetchError || !existingProduct) {
        throw new Error('Product not found or access denied')
      }

      const existingProviderType =
        (existingProduct.payment_provider as PaymentProvider | null) || 'manual'
      const providerChanged = existingProviderType !== provider.provider
      providerProductId = existingProduct.provider_product_id as string | null
      providerPriceId = existingProduct.provider_price_id as string | null

      if (!providerProductId || providerChanged) {
        // Defer archiving the old objects until the DB commit succeeds.
        if (providerProductId && providerPriceId) {
          staleProviderObjects.push({
            provider: existingProviderType,
            productId: providerProductId,
            priceId: providerPriceId,
          })
        }

        const paymentProduct = await provider.createProduct({
          name: input.course.title.trim(),
          description: input.course.description?.trim() || '',
          images: input.course.thumbnailUrl ? [input.course.thumbnailUrl] : [],
          metadata: {
            created_by: 'admin_product_creation_wizard',
            recreated_at: new Date().toISOString(),
          },
        })
        createdProviderObjects.push({ productId: paymentProduct.id })

        const paymentPrice = await provider.createPrice({
          productId: paymentProduct.id,
          amount: provider.convertAmount(nextPrice, 'major'),
          currency: nextCurrency,
          type: 'one_time',
          metadata: { product_name: input.course.title.trim() },
        })
        createdProviderObjects.push({ priceId: paymentPrice.id })

        providerProductId = paymentProduct.id
        providerPriceId = paymentPrice.id
      } else {
        await provider.updateProduct(providerProductId, {
          name: input.course.title.trim(),
          description: input.course.description?.trim() || '',
          images: input.course.thumbnailUrl ? [input.course.thumbnailUrl] : [],
        })

        const priceChanged =
          nextPrice !== existingProduct.price || nextCurrency !== existingProduct.currency

        if (!providerPriceId || priceChanged) {
          const paymentPrice = await provider.createPrice({
            productId: providerProductId,
            amount: provider.convertAmount(nextPrice, 'major'),
            currency: nextCurrency,
            type: 'one_time',
            metadata: { product_name: input.course.title.trim() },
          })
          createdProviderObjects.push({ priceId: paymentPrice.id })

          if (providerPriceId) {
            staleProviderObjects.push({ provider: provider.provider, priceId: providerPriceId })
          }
          providerPriceId = paymentPrice.id
        }
      }
    } else {
      const paymentProduct = await provider.createProduct({
        name: input.course.title.trim(),
        description: input.course.description?.trim() || '',
        images: input.course.thumbnailUrl ? [input.course.thumbnailUrl] : [],
        metadata: {
          created_by: 'admin_product_creation_wizard',
          created_at: new Date().toISOString(),
        },
      })
      createdProviderObjects.push({ productId: paymentProduct.id })

      const paymentPrice = await provider.createPrice({
        productId: paymentProduct.id,
        amount: provider.convertAmount(nextPrice, 'major'),
        currency: nextCurrency,
        type: 'one_time',
        metadata: { product_name: input.course.title.trim() },
      })
      createdProviderObjects.push({ priceId: paymentPrice.id })

      providerProductId = paymentProduct.id
      providerPriceId = paymentPrice.id
    }

    // Single transaction: course + product + link + steps commit together.
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      'save_product_creation_wizard',
      {
        _tenant_id: tenantId,
        _author_id: userId,
        _intent: input.intent,
        _source_mode: input.course.sourceMode,
        _existing_course_id: input.course.existingCourseId ?? null,
        _course: coursePayload,
        _pricing_mode: 'paid',
        _product_id: productId,
        _product: {
          price: nextPrice,
          currency: nextCurrency,
          payment_provider: provider.provider,
          provider_product_id: providerProductId,
          provider_price_id: providerPriceId,
        },
        _steps: buildPostRegistrationStepRows(input.postRegistrationSteps),
      }
    )

    if (rpcError) {
      // Compensate: roll back the external provider objects we just created so a
      // failed DB transaction doesn't leak orphaned Stripe/PayPal objects.
      await compensateProviderObjects(provider, createdProviderObjects)
      throw new Error(rpcError.message)
    }

    // Commit succeeded — safe to archive the superseded provider objects.
    for (const stale of staleProviderObjects) {
      try {
        const staleProvider = getPaymentProvider(stale.provider)
        if (stale.priceId) await staleProvider.archivePrice(stale.priceId)
        if (stale.productId) await staleProvider.archiveProduct(stale.productId)
      } catch (cleanupError) {
        console.error('Failed to archive superseded provider object:', cleanupError)
      }
    }

    revalidateOfferingPaths()

    return {
      success: true,
      data: {
        courseId: (rpcResult as { course_id: number }).course_id,
        productId: (rpcResult as { product_id: number }).product_id,
        pricingMode: 'paid',
        published: input.intent === 'publish',
      },
    }
  } catch (error) {
    console.error('Save product creation wizard failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save offering',
    }
  }
}

/**
 * Archives a product (soft delete)
 */
export async function archiveProduct(productId: number): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!productId) {
      throw new Error('Product ID is required')
    }

    const adminClient = createAdminClient()

    // Get product details and verify tenant ownership
    const { data: product, error: fetchError } = await adminClient
      .from('products')
      .select('payment_provider, provider_product_id, provider_price_id, tenant_id')
      .eq('product_id', productId)
      .single()

    if (fetchError || !product) {
      throw new Error('Product not found')
    }

    // Verify product belongs to tenant (unless super_admin)
    if (!isSuperAdminUser && product.tenant_id !== tenantId) {
      throw new Error('Product not found or access denied')
    }

    // Archive in payment provider
    if (product.provider_product_id && product.provider_price_id) {
      const providerType = product.payment_provider as PaymentProvider || 'stripe'
      const provider = getPaymentProvider(providerType)

      await provider.archivePrice(product.provider_price_id)
      await provider.archiveProduct(product.provider_product_id)
    }

    // Update database
    const { error: updateError } = await adminClient
      .from('products')
      .update({ status: 'inactive' })
      .eq('product_id', productId)
      .eq('tenant_id', tenantId)

    if (updateError) throw updateError

    revalidatePath('/dashboard/admin/products')
    revalidatePath('/dashboard/student')

    return { success: true }

  } catch (error) {
    console.error('Archive product failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive product'
    }
  }
}

/**
 * Restores an archived product
 */
export async function restoreProduct(productId: number): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!productId) {
      throw new Error('Product ID is required')
    }

    const adminClient = createAdminClient()

    // Get product details and verify tenant ownership
    const { data: product, error: fetchError } = await adminClient
      .from('products')
      .select('payment_provider, provider_product_id, provider_price_id, tenant_id')
      .eq('product_id', productId)
      .single()

    if (fetchError || !product) {
      throw new Error('Product not found')
    }

    // Verify product belongs to tenant (unless super_admin)
    if (!isSuperAdminUser && product.tenant_id !== tenantId) {
      throw new Error('Product not found or access denied')
    }

    // Restore in payment provider
    if (product.provider_product_id) {
      const providerType = product.payment_provider as PaymentProvider || 'stripe'
      const provider = getPaymentProvider(providerType)

      await provider.restoreProduct(product.provider_product_id)
    }

    // Update database
    const { error: updateError } = await adminClient
      .from('products')
      .update({ status: 'active' })
      .eq('product_id', productId)
      .eq('tenant_id', tenantId)

    if (updateError) throw updateError

    revalidatePath('/dashboard/admin/products')
    revalidatePath('/dashboard/student')

    return { success: true }

  } catch (error) {
    console.error('Restore product failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore product'
    }
  }
}
