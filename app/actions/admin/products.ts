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

type UntypedSupabaseClient = {
  from: (table: string) => {
    delete: () => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => Promise<{ error: unknown }>
      }
    }
    insert: (rows: unknown[]) => Promise<{ error: unknown }>
  }
}

function normalizePostRegistrationSteps(
  tenantId: string,
  productId: number,
  steps: ProductPostRegistrationStepInput[]
) {
  return steps
    .filter((step) => step.isActive)
    .map((step, index) => ({
      tenant_id: tenantId,
      product_id: productId,
      type: step.type,
      title: step.title.trim(),
      description: step.description?.trim() || null,
      url: step.type === 'text' ? null : step.url?.trim() || null,
      sort_order: index,
      is_active: true,
    }))
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

    let courseId = input.course.existingCourseId ?? null
    const coursePayload = {
      title: input.course.title.trim(),
      description: input.course.description?.trim() || null,
      thumbnail_url: input.course.thumbnailUrl?.trim() || null,
      category_id: input.course.categoryId || null,
      status: input.intent === 'publish' ? 'published' : 'draft',
    }

    if (input.course.sourceMode === 'existing') {
      const { data: existingCourse, error: courseError } = await adminClient
        .from('courses')
        .select('course_id, tenant_id')
        .eq('course_id', input.course.existingCourseId!)
        .eq('tenant_id', tenantId)
        .single()

      if (courseError || !existingCourse) {
        throw new Error('Course not found or access denied')
      }

      const { error: updateCourseError } = await adminClient
        .from('courses')
        .update(coursePayload)
        .eq('course_id', courseId!)
        .eq('tenant_id', tenantId)

      if (updateCourseError) throw updateCourseError
    } else {
      const limitCheck = await checkCourseLimit()
      if (!limitCheck.canCreate) {
        throw new Error(
          `Your ${limitCheck.plan} plan is limited to ${limitCheck.limit} courses. You currently have ${limitCheck.currentCount} courses.`
        )
      }

      await adminClient
        .from('profiles')
        .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })

      const { data: course, error: createCourseError } = await adminClient
        .from('courses')
        .insert({
          ...coursePayload,
          tenant_id: tenantId,
          author_id: userId,
        })
        .select('course_id')
        .single()

      if (createCourseError) throw createCourseError
      courseId = course.course_id
    }

    let productId = input.productId ?? null

    if (input.pricing.mode === 'free') {
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

        const { error: archiveError } = await adminClient
          .from('products')
          .update({ status: 'inactive' })
          .eq('product_id', productId)
          .eq('tenant_id', tenantId)

        if (archiveError) throw archiveError
      }

      revalidatePath('/dashboard/admin/products')
      revalidatePath('/dashboard/admin/monetization')
      revalidatePath('/dashboard/teacher/courses')
      revalidatePath('/courses')
      revalidatePath('/products')
      revalidatePath('/dashboard/student')

      return {
        success: true,
        data: {
          courseId: courseId!,
          productId: null,
          pricingMode: 'free',
          published: input.intent === 'publish',
        },
      }
    }

    const provider = getPaymentProvider(input.pricing.paymentProvider || 'manual')
    const nextPrice = input.pricing.price!
    const nextCurrency = input.pricing.currency! as Currency
    const postRegistrationClient = adminClient as unknown as UntypedSupabaseClient

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
      let providerProductId = existingProduct.provider_product_id as string | null
      let providerPriceId = existingProduct.provider_price_id as string | null

      if (!providerProductId || providerChanged) {
        if (providerProductId && providerPriceId) {
          const existingProvider = getPaymentProvider(existingProviderType)
          await existingProvider.archivePrice(providerPriceId)
          await existingProvider.archiveProduct(providerProductId)
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

        const paymentPrice = await provider.createPrice({
          productId: paymentProduct.id,
          amount: provider.convertAmount(nextPrice, 'major'),
          currency: nextCurrency,
          type: 'one_time',
          metadata: {
            product_name: input.course.title.trim(),
          },
        })

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
            metadata: {
              product_name: input.course.title.trim(),
            },
          })

          if (providerPriceId) {
            await provider.archivePrice(providerPriceId)
          }

          providerPriceId = paymentPrice.id
        }
      }

      const { error: updateProductError } = await adminClient
        .from('products')
        .update({
          name: input.course.title.trim(),
          description: input.course.description?.trim() || null,
          price: nextPrice,
          currency: nextCurrency,
          image: input.course.thumbnailUrl?.trim() || null,
          payment_provider: provider.provider,
          provider_product_id: providerProductId,
          provider_price_id: providerPriceId,
          status: input.intent === 'publish' ? 'active' : 'inactive',
        })
        .eq('product_id', productId)
        .eq('tenant_id', tenantId)

      if (updateProductError) throw updateProductError
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

      const paymentPrice = await provider.createPrice({
        productId: paymentProduct.id,
        amount: provider.convertAmount(nextPrice, 'major'),
        currency: nextCurrency,
        type: 'one_time',
        metadata: {
          product_name: input.course.title.trim(),
        },
      })

      const { data: product, error: createProductError } = await adminClient
        .from('products')
        .insert({
          tenant_id: tenantId,
          name: input.course.title.trim(),
          description: input.course.description?.trim() || null,
          price: nextPrice,
          currency: nextCurrency,
          image: input.course.thumbnailUrl?.trim() || null,
          payment_provider: provider.provider,
          provider_product_id: paymentProduct.id,
          provider_price_id: paymentPrice.id,
          status: input.intent === 'publish' ? 'active' : 'inactive',
        })
        .select('product_id')
        .single()

      if (createProductError) throw createProductError
      productId = product.product_id
    }

    await adminClient
      .from('product_courses')
      .delete()
      .eq('product_id', productId!)
      .eq('tenant_id', tenantId)

    const { error: linkError } = await adminClient
      .from('product_courses')
      .insert({
        tenant_id: tenantId,
        product_id: productId!,
        course_id: courseId!,
      })

    if (linkError) throw linkError

    const { error: deleteStepsError } = await postRegistrationClient
      .from('product_post_registration_steps')
      .delete()
      .eq('product_id', productId!)
      .eq('tenant_id', tenantId)

    if (deleteStepsError) throw deleteStepsError

    const stepRows = normalizePostRegistrationSteps(
      tenantId,
      productId!,
      input.postRegistrationSteps
    )

    if (stepRows.length > 0) {
      const { error: stepsError } = await postRegistrationClient
        .from('product_post_registration_steps')
        .insert(stepRows)

      if (stepsError) throw stepsError
    }

    revalidatePath('/dashboard/admin/products')
    revalidatePath('/dashboard/admin/monetization')
    revalidatePath('/dashboard/teacher/courses')
    revalidatePath('/courses')
    revalidatePath('/products')
    revalidatePath('/dashboard/student')

    return {
      success: true,
      data: {
        courseId: courseId!,
        productId,
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
