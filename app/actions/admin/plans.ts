'use server'

import { revalidatePath } from 'next/cache'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
})

interface PlanFormData {
  plan_name: string
  description: string
  price: number
  duration_in_days: number // 30 for monthly, 365 for yearly
  currency: 'usd' | 'eur'
  features?: string
  courseIds: number[]
}

interface Plan {
  plan_id: number
  plan_name: string
  description: string
  price: number
  duration_in_days: number
  currency: string
  features?: string
  stripe_product_id?: string
  stripe_price_id?: string
}

/**
 * Creates a new subscription plan with Stripe integration
 */
export async function createPlan(formData: PlanFormData): Promise<ActionResult<Plan>> {
  try {
    await verifyAdminAccess()

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

    // 1. Create Stripe product for subscription
    const stripeProduct = await stripe.products.create({
      name: formData.plan_name.trim(),
      description: formData.description?.trim() || undefined,
      metadata: {
        type: 'subscription',
        duration_days: formData.duration_in_days.toString(),
        created_by: 'admin',
        created_at: new Date().toISOString()
      }
    })

    // 2. Create Stripe recurring price
    const interval = formData.duration_in_days === 30 ? 'month' : 'year'
    const stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: Math.round(formData.price * 100), // Convert to cents
      currency: formData.currency,
      recurring: {
        interval: interval,
        interval_count: 1
      },
      metadata: {
        plan_name: formData.plan_name
      }
    })

    // 3. Insert plan into database
    const adminClient = createAdminClient()
    const { data: plan, error: insertError } = await adminClient
      .from('plans')
      .insert({
        plan_name: formData.plan_name.trim(),
        description: formData.description?.trim() || null,
        price: formData.price,
        duration_in_days: formData.duration_in_days,
        currency: formData.currency,
        features: formData.features || null,
        stripe_product_id: stripeProduct.id,
        stripe_price_id: stripePrice.id
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

    // Get existing plan
    const { data: existingPlan, error: fetchError } = await adminClient
      .from('plans')
      .select('*')
      .eq('plan_id', planId)
      .single()

    if (fetchError || !existingPlan) {
      throw new Error('Plan not found')
    }

    // Update Stripe product
    if (existingPlan.stripe_product_id) {
      await stripe.products.update(existingPlan.stripe_product_id, {
        name: formData.plan_name.trim(),
        description: formData.description?.trim() || undefined
      })

      // If price or duration changed, create new Stripe price
      const priceChanged = formData.price !== existingPlan.price
      const durationChanged = formData.duration_in_days !== existingPlan.duration_in_days
      const currencyChanged = formData.currency !== existingPlan.currency

      if (priceChanged || durationChanged || currencyChanged) {
        const interval = formData.duration_in_days === 30 ? 'month' : 'year'
        const newPrice = await stripe.prices.create({
          product: existingPlan.stripe_product_id,
          unit_amount: Math.round(formData.price * 100),
          currency: formData.currency,
          recurring: {
            interval: interval,
            interval_count: 1
          },
          metadata: {
            plan_name: formData.plan_name
          }
        })

        // Archive old price
        if (existingPlan.stripe_price_id) {
          await stripe.prices.update(existingPlan.stripe_price_id, {
            active: false
          })
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
            stripe_price_id: newPrice.id,
            updated_at: new Date().toISOString()
          })
          .eq('plan_id', planId)
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

    // Update plan without price change
    const { data: plan, error: updateError } = await adminClient
      .from('plans')
      .update({
        plan_name: formData.plan_name.trim(),
        description: formData.description?.trim() || null,
        features: formData.features || null,
        updated_at: new Date().toISOString()
      })
      .eq('plan_id', planId)
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

    if (!planId) {
      throw new Error('Plan ID is required')
    }

    const adminClient = createAdminClient()

    // Get plan details
    const { data: plan, error: fetchError } = await adminClient
      .from('plans')
      .select('stripe_product_id, stripe_price_id')
      .eq('plan_id', planId)
      .single()

    if (fetchError || !plan) {
      throw new Error('Plan not found')
    }

    // Archive Stripe price
    if (plan.stripe_price_id) {
      await stripe.prices.update(plan.stripe_price_id, {
        active: false
      })
    }

    // Archive Stripe product
    if (plan.stripe_product_id) {
      await stripe.products.update(plan.stripe_product_id, {
        active: false
      })
    }

    // Update database (plans don't have status column, so we'll add deleted_at)
    const { error: updateError } = await adminClient
      .from('plans')
      .update({ deleted_at: new Date().toISOString() })
      .eq('plan_id', planId)

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
