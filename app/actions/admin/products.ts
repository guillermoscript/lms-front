'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getPaymentProvider, PaymentProvider, PROVIDER_CAPABILITIES } from '@/lib/payments'
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
  /** Lemon Squeezy variant id, pasted by the admin (→ provider_price_id). LS only. */
  providerPriceId?: string
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

    // Resolve provider by capability from the static map. Do NOT instantiate the
    // provider yet — provider constructors (e.g. Lemon Squeezy) throw on missing
    // env, and only the createsCatalog branch actually needs a live client.
    const providerType = formData.paymentProvider || 'stripe'
    const caps = PROVIDER_CAPABILITIES[providerType]
    const adminClient = createAdminClient()

    // Resolve provider catalog ids by CAPABILITY, never by provider name:
    //  - createsCatalog (Stripe/PayPal) → auto-create product + one-time price.
    //  - isMerchantOfRecord (Lemon Squeezy) → catalog lives in their dashboard;
    //    the admin pastes the variant id; provider_product_id stays null.
    //  - else (Solana/manual) → no catalog ids; Solana needs a configured wallet.
    let providerProductId: string | null = null
    let providerPriceId: string | null = null

    if (caps.createsCatalog) {
      // Only providers with their own catalog API need a live client.
      const provider = getPaymentProvider(providerType)
      const paymentProduct = await provider.createProduct({
        name: formData.name.trim(),
        description: formData.description?.trim() || '',
        images: formData.image ? [formData.image] : [],
        metadata: {
          created_by: 'admin',
          created_at: new Date().toISOString()
        }
      })

      const paymentPrice = await provider.createPrice({
        productId: paymentProduct.id,
        amount: provider.convertAmount(formData.price, 'major'), // Convert to base units
        currency: formData.currency,
        type: 'one_time',
        metadata: {
          product_name: formData.name
        }
      })

      providerProductId = paymentProduct.id
      providerPriceId = paymentPrice.id
    } else if (caps.isMerchantOfRecord) {
      // Lemon Squeezy — admin must paste the variant id (checkout 400s without it).
      const variantId = formData.providerPriceId?.trim()
      if (!variantId) {
        throw new Error('Lemon Squeezy requires a variant id. Copy it from your Lemon Squeezy dashboard.')
      }
      providerPriceId = variantId
    } else if (providerType === 'solana' || providerType === 'solana_subs') {
      // No catalog — but the school must have a receiving wallet, else checkout 400s.
      const { data: wallet } = await adminClient
        .from('tenant_payment_wallets')
        .select('wallet_address')
        .eq('tenant_id', tenantId)
        .eq('provider', providerType)
        .maybeSingle()
      if (!wallet?.wallet_address) {
        throw new Error('Configure your Solana wallet in Settings → Payment before creating a Solana product.')
      }
    }

    // 3. Insert product into database
    const { data: product, error: insertError } = await adminClient
      .from('products')
      .insert({
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        price: formData.price,
        currency: formData.currency,
        image: formData.image || null,
        payment_provider: providerType,
        provider_product_id: providerProductId,
        provider_price_id: providerPriceId,
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

    // Get payment provider (provider is immutable post-create)
    const providerType = existingProduct.payment_provider as PaymentProvider || 'stripe'
    const caps = PROVIDER_CAPABILITIES[providerType]

    // Catalog-syncing providers (Stripe/PayPal) only: update the provider product
    // and recreate the price on change. LS/Solana/manual skip this — they have no
    // provider catalog to mutate; their price lives in the product columns (and the
    // LS variant id is edited via the form below). Instantiate the provider only
    // here — its constructor (e.g. Lemon Squeezy) throws on missing env.
    if (caps.createsCatalog && existingProduct.provider_product_id) {
      const provider = getPaymentProvider(providerType)
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

    // Fallthrough update: Stripe/PayPal with no price change keep their
    // provider-managed price columns untouched (only name/description/image).
    // Non-catalog providers (LS/Solana/manual) own their price columns directly,
    // so write price/currency here; LS may also re-paste its variant id.
    const fallthroughUpdate: Record<string, unknown> = {
      name: formData.name.trim(),
      description: formData.description?.trim() || null,
      image: formData.image || null,
    }
    if (!caps.createsCatalog) {
      fallthroughUpdate.price = formData.price
      fallthroughUpdate.currency = formData.currency
      if (caps.isMerchantOfRecord && formData.providerPriceId !== undefined) {
        fallthroughUpdate.provider_price_id = formData.providerPriceId.trim() || null
      }
    }

    const { data: product, error: updateError } = await adminClient
      .from('products')
      .update(fallthroughUpdate)
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

    // Archive in payment provider — ONLY for providers that own their catalog
    // (Stripe/PayPal). LS stores a variant id from THEIR dashboard and its provider
    // constructor throws on missing env; Solana/manual have no catalog. Gate on it.
    const archiveProviderType = product.payment_provider as PaymentProvider || 'stripe'
    if (PROVIDER_CAPABILITIES[archiveProviderType]?.createsCatalog && product.provider_product_id && product.provider_price_id) {
      const provider = getPaymentProvider(archiveProviderType)

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

    // Restore in payment provider — ONLY for catalog-owning providers (Stripe/
    // PayPal). LS/Solana/manual have no catalog product to restore, and the LS
    // provider constructor throws on missing env.
    const restoreProviderType = product.payment_provider as PaymentProvider || 'stripe'
    if (PROVIDER_CAPABILITIES[restoreProviderType]?.createsCatalog && product.provider_product_id) {
      const provider = getPaymentProvider(restoreProviderType)

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
