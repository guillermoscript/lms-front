'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getPaymentProvider, PaymentProvider } from '@/lib/payments'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'

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
      course_id: courseId
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
            updated_at: new Date().toISOString()
          })
          .eq('product_id', productId)
          .eq('tenant_id', tenantId)
          .select()
          .single()

        if (updateError) throw updateError

        // Update course links
        await adminClient
          .from('product_courses')
          .delete()
          .eq('product_id', productId)
          .eq('tenant_id', tenantId)

        if (formData.courseIds.length > 0) {
          const courseLinks = formData.courseIds.map(courseId => ({
            product_id: productId,
            course_id: courseId
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
        updated_at: new Date().toISOString()
      })
      .eq('product_id', productId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (updateError) throw updateError

    // Update course links
    await adminClient
      .from('product_courses')
      .delete()
      .eq('product_id', productId)
      .eq('tenant_id', tenantId)

    if (formData.courseIds.length > 0) {
      const courseLinks = formData.courseIds.map(courseId => ({
        product_id: productId,
        course_id: courseId
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
