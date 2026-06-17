'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getPaymentProvider, PaymentProvider, PROVIDER_CAPABILITIES } from '@/lib/payments'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'

interface PlanFormData {
  plan_name: string
  description: string
  price: number
  duration_in_days: number // 30 for monthly, 365 for yearly
  currency: 'usd' | 'eur'
  features?: string
  courseIds: number[]
  paymentProvider?: PaymentProvider
  /** Lemon Squeezy variant id, pasted by the admin (→ provider_price_id). LS only. */
  providerPriceId?: string
}

interface Plan {
  plan_id: number
  plan_name: string
  description: string
  price: number
  duration_in_days: number
  currency: string
  features?: string
  payment_provider: string
  provider_product_id?: string
  provider_price_id?: string
}

/**
 * Creates a new subscription plan with Stripe integration
 */
export async function createPlan(formData: PlanFormData): Promise<ActionResult<Plan>> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()

    // Validate input
    if (!formData.plan_name || formData.plan_name.trim().length === 0) {
      throw new Error('Plan name is required')
    }

    if (formData.price <= 0) {
      throw new Error('Price must be greater than 0')
    }

    if (!formData.duration_in_days || ![30, 365].includes(formData.duration_in_days)) {
      throw new Error('Duration must be 30 (monthly) or 365 (yearly)')
    }

    // Resolve provider by capability from the static map. Do NOT instantiate the
    // provider yet — provider constructors (e.g. Lemon Squeezy) throw on missing
    // env, and only the createsCatalog branch actually needs a live client.
    const providerType = formData.paymentProvider || 'stripe'
    const caps = PROVIDER_CAPABILITIES[providerType]
    const adminClient = createAdminClient()

    // Resolve provider catalog ids by CAPABILITY, never by provider name:
    //  - createsCatalog (Stripe/PayPal) → auto-create product + recurring price.
    //  - isMerchantOfRecord (Lemon Squeezy) → catalog lives in their dashboard;
    //    the admin pastes the variant id; provider_product_id stays null.
    //  - else (Solana/manual) → no catalog ids; Solana needs a configured wallet.
    let providerProductId: string | null = null
    let providerPriceId: string | null = null

    if (caps.createsCatalog) {
      // Only providers with their own catalog API need a live client.
      const provider = getPaymentProvider(providerType)
      const paymentProduct = await provider.createProduct({
        name: formData.plan_name.trim(),
        description: formData.description?.trim() || '',
        metadata: {
          type: 'subscription',
          duration_days: formData.duration_in_days.toString(),
          created_by: 'admin',
          created_at: new Date().toISOString()
        }
      })

      const interval = formData.duration_in_days === 30 ? 'month' : 'year'
      const paymentPrice = await provider.createPrice({
        productId: paymentProduct.id,
        amount: provider.convertAmount(formData.price, 'major'), // Convert to base units
        currency: formData.currency,
        type: 'subscription',
        interval,
        metadata: {
          plan_name: formData.plan_name
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
        throw new Error('Configure your Solana wallet in Settings → Payment before creating a Solana plan.')
      }
    }

    // 3. Insert plan into database
    const { data: plan, error: insertError } = await adminClient
      .from('plans')
      .insert({
        plan_name: formData.plan_name.trim(),
        description: formData.description?.trim() || null,
        price: formData.price,
        duration_in_days: formData.duration_in_days,
        currency: formData.currency,
        features: formData.features || null,
        payment_provider: providerType,
        provider_product_id: providerProductId,
        provider_price_id: providerPriceId,
        tenant_id: tenantId
      })
      .select()
      .single()

    if (insertError) throw insertError

    // 4. Link courses to plan
    if (formData.courseIds && formData.courseIds.length > 0) {
      const courseLinks = formData.courseIds.map(courseId => ({
        plan_id: plan.plan_id,
        course_id: courseId
      }))

      const { error: linkError } = await adminClient
        .from('plan_courses')
        .insert(courseLinks)

      if (linkError) throw linkError
    }

    revalidatePath('/dashboard/admin/plans')
    revalidatePath('/dashboard/student')

    return { success: true, data: plan }

  } catch (error) {
    console.error('Create plan failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create plan'
    }
  }
}

/**
 * Updates an existing plan
 */
export async function updatePlan(
  planId: number,
  formData: PlanFormData
): Promise<ActionResult<Plan>> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!planId) {
      throw new Error('Plan ID is required')
    }

    if (!formData.plan_name || formData.plan_name.trim().length === 0) {
      throw new Error('Plan name is required')
    }

    if (formData.price <= 0) {
      throw new Error('Price must be greater than 0')
    }

    const adminClient = createAdminClient()

    // Get existing plan and verify tenant ownership
    const { data: existingPlan, error: fetchError } = await adminClient
      .from('plans')
      .select('*')
      .eq('plan_id', planId)
      .single()

    if (fetchError || !existingPlan) {
      throw new Error('Plan not found')
    }

    // Verify plan belongs to tenant (unless super_admin)
    if (!isSuperAdminUser && existingPlan.tenant_id !== tenantId) {
      throw new Error('Plan not found or access denied')
    }

    // Get payment provider from the existing plan (provider is immutable post-create)
    const providerType = (existingPlan.payment_provider as PaymentProvider) || 'stripe'
    const caps = PROVIDER_CAPABILITIES[providerType]

    // Catalog-syncing providers (Stripe/PayPal) only: update the provider product
    // and recreate the recurring price on change. LS/Solana/manual skip this — they
    // have no provider catalog to mutate; their price lives in the plan columns
    // (and the LS variant id is edited via the form below). Instantiate the provider
    // only here — its constructor (e.g. Lemon Squeezy) throws on missing env.
    if (caps.createsCatalog && existingPlan.provider_product_id) {
      const provider = getPaymentProvider(providerType)
      await provider.updateProduct(existingPlan.provider_product_id, {
        name: formData.plan_name.trim(),
        description: formData.description?.trim() || ''
      })

      // If price or duration changed, create a new recurring price
      const priceChanged = formData.price !== existingPlan.price
      const durationChanged = formData.duration_in_days !== existingPlan.duration_in_days
      const currencyChanged = formData.currency !== existingPlan.currency

      if (priceChanged || durationChanged || currencyChanged) {
        const interval = formData.duration_in_days === 30 ? 'month' : 'year'
        const newPrice = await provider.createPrice({
          productId: existingPlan.provider_product_id,
          amount: provider.convertAmount(formData.price, 'major'),
          currency: formData.currency,
          type: 'subscription',
          interval,
          metadata: {
            plan_name: formData.plan_name
          }
        })

        // Archive old price
        if (existingPlan.provider_price_id) {
          await provider.archivePrice(existingPlan.provider_price_id)
        }

        // Update plan with new price ID
        const { data: plan, error: updateError } = await adminClient
          .from('plans')
          .update({
            plan_name: formData.plan_name.trim(),
            description: formData.description?.trim() || null,
            price: formData.price,
            duration_in_days: formData.duration_in_days,
            currency: formData.currency,
            features: formData.features || null,
            provider_price_id: newPrice.id,
            updated_at: new Date().toISOString()
          })
          .eq('plan_id', planId)
          .eq('tenant_id', tenantId)
          .select()
          .single()

        if (updateError) throw updateError

        // Update course links
        await adminClient
          .from('plan_courses')
          .delete()
          .eq('plan_id', planId)

        if (formData.courseIds && formData.courseIds.length > 0) {
          const courseLinks = formData.courseIds.map(courseId => ({
            plan_id: planId,
            course_id: courseId
          }))

          await adminClient.from('plan_courses').insert(courseLinks)
        }

        revalidatePath('/dashboard/admin/plans')
        revalidatePath('/dashboard/student')

        return { success: true, data: plan }
      }
    }

    // Fallthrough update: Stripe/PayPal with no price change keep their
    // provider-managed price columns untouched (only name/description/features).
    // Non-catalog providers (LS/Solana/manual) own their price columns directly,
    // so write price/currency/duration here; LS may also re-paste its variant id.
    const fallthroughUpdate: Record<string, unknown> = {
      plan_name: formData.plan_name.trim(),
      description: formData.description?.trim() || null,
      features: formData.features || null,
      updated_at: new Date().toISOString()
    }
    if (!caps.createsCatalog) {
      fallthroughUpdate.price = formData.price
      fallthroughUpdate.duration_in_days = formData.duration_in_days
      fallthroughUpdate.currency = formData.currency
      if (caps.isMerchantOfRecord && formData.providerPriceId !== undefined) {
        fallthroughUpdate.provider_price_id = formData.providerPriceId.trim() || null
      }
    }

    const { data: plan, error: updateError } = await adminClient
      .from('plans')
      .update(fallthroughUpdate)
      .eq('plan_id', planId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (updateError) throw updateError

    // Update course links
    await adminClient
      .from('plan_courses')
      .delete()
      .eq('plan_id', planId)

    if (formData.courseIds && formData.courseIds.length > 0) {
      const courseLinks = formData.courseIds.map(courseId => ({
        plan_id: planId,
        course_id: courseId
      }))

      await adminClient.from('plan_courses').insert(courseLinks)
    }

    revalidatePath('/dashboard/admin/plans')
    revalidatePath('/dashboard/student')

    return { success: true, data: plan }

  } catch (error) {
    console.error('Update plan failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update plan'
    }
  }
}

/**
 * Archives a plan (soft delete)
 */
export async function archivePlan(planId: number): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const tenantId = await getCurrentTenantId()
    const isSuperAdminUser = await isSuperAdmin()

    if (!planId) {
      throw new Error('Plan ID is required')
    }

    const adminClient = createAdminClient()

    // Get plan details and verify tenant ownership
    const { data: plan, error: fetchError } = await adminClient
      .from('plans')
      .select('payment_provider, provider_product_id, provider_price_id, tenant_id')
      .eq('plan_id', planId)
      .single()

    if (fetchError || !plan) {
      throw new Error('Plan not found')
    }

    // Verify plan belongs to tenant (unless super_admin)
    if (!isSuperAdminUser && plan.tenant_id !== tenantId) {
      throw new Error('Plan not found or access denied')
    }

    // Archive in payment provider — ONLY for providers that own their catalog
    // (Stripe/PayPal). For Lemon Squeezy the stored id is a variant in THEIR
    // dashboard (not ours to archive), and its provider constructor throws on
    // missing env; Solana/manual have no catalog. So gate on the capability.
    const providerType = (plan.payment_provider as PaymentProvider) || 'stripe'
    if (PROVIDER_CAPABILITIES[providerType]?.createsCatalog && (plan.provider_price_id || plan.provider_product_id)) {
      const provider = getPaymentProvider(providerType)

      if (plan.provider_price_id) {
        await provider.archivePrice(plan.provider_price_id)
      }
      if (plan.provider_product_id) {
        await provider.archiveProduct(plan.provider_product_id)
      }
    }

    // Update database (plans don't have status column, so we'll add deleted_at)
    const { error: updateError } = await adminClient
      .from('plans')
      .update({ deleted_at: new Date().toISOString() })
      .eq('plan_id', planId)
      .eq('tenant_id', tenantId)

    if (updateError) throw updateError

    revalidatePath('/dashboard/admin/plans')
    revalidatePath('/dashboard/student')

    return { success: true }

  } catch (error) {
    console.error('Archive plan failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive plan'
    }
  }
}
