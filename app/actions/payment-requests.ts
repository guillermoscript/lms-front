'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { verifyAdminAccess, createAdminClient, type ActionResult } from '@/lib/supabase/admin'

interface CreatePaymentRequestData {
  productId: number
  contactName: string
  contactEmail: string
  contactPhone?: string
  message?: string
}

interface PaymentRequest {
  request_id: number
  user_id: string
  product_id: number
  contact_name: string
  contact_email: string
  contact_phone: string | null
  message: string | null
  status: string
  payment_method: string | null
  payment_amount: number | null
  payment_currency: string | null
  invoice_number: string | null
  created_at: string
  updated_at: string
}

/**
 * Student creates a payment request for manual payment
 */
export async function createPaymentRequest(
  data: CreatePaymentRequestData
): Promise<ActionResult<PaymentRequest>> {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('You must be logged in to request payment information')
    }

    // Validate product exists and is manual payment
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('product_id, name, price, currency, payment_provider')
      .eq('product_id', data.productId)
      .eq('status', 'active')
      .single()

    if (productError || !product) {
      throw new Error('Product not found')
    }

    if (product.payment_provider !== 'manual') {
      throw new Error('This product does not support manual payment')
    }

    // Check if user already has a pending request for this product
    const { data: existingRequest } = await supabase
      .from('payment_requests')
      .select('request_id, status')
      .eq('user_id', user.id)
      .eq('product_id', data.productId)
      .in('status', ['pending', 'contacted', 'payment_received'])
      .single()

    if (existingRequest) {
      throw new Error('You already have a pending payment request for this product')
    }

    // Create payment request
    const { data: request, error: insertError } = await supabase
      .from('payment_requests')
      .insert({
        user_id: user.id,
        product_id: data.productId,
        contact_name: data.contactName,
        contact_email: data.contactEmail,
        contact_phone: data.contactPhone || null,
        message: data.message || null,
        payment_amount: product.price,
        payment_currency: product.currency,
        status: 'pending'
      })
      .select()
      .single()

    if (insertError) throw insertError

    // TODO: Send notification to admin
    // TODO: Send confirmation email to student

    revalidatePath('/dashboard/student')
    revalidatePath('/dashboard/admin/payment-requests')

    return { success: true, data: request }

  } catch (error) {
    console.error('Create payment request failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment request'
    }
  }
}

/**
 * Admin updates payment request status and details
 */
export async function updatePaymentRequest(
  requestId: number,
  updates: {
    status?: string
    paymentMethod?: string
    paymentInstructions?: string
    paymentDeadline?: string
    adminNotes?: string
  }
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (updates.status) updateData.status = updates.status
    if (updates.paymentMethod) updateData.payment_method = updates.paymentMethod
    if (updates.paymentInstructions) updateData.payment_instructions = updates.paymentInstructions
    if (updates.paymentDeadline) updateData.payment_deadline = updates.paymentDeadline
    if (updates.adminNotes) updateData.admin_notes = updates.adminNotes
    if (user) updateData.processed_by = user.id

    // If marking as payment received, set timestamp
    if (updates.status === 'payment_received') {
      updateData.payment_confirmed_at = new Date().toISOString()
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient
      .from('payment_requests')
      .update(updateData)
      .eq('request_id', requestId)

    if (error) throw error

    // TODO: Send notification to student about status change
    // TODO: If status is 'contacted', send payment instructions email

    revalidatePath('/dashboard/admin/payment-requests')

    return { success: true }

  } catch (error) {
    console.error('Update payment request failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update payment request'
    }
  }
}

/**
 * Admin confirms payment and enrolls student
 */
export async function confirmPaymentAndEnroll(
  requestId: number
): Promise<ActionResult> {
  try {
    await verifyAdminAccess()

    const adminClient = createAdminClient()

    // Get payment request details
    const { data: request, error: requestError } = await adminClient
      .from('payment_requests')
      .select(`
        *,
        product:products(
          product_id,
          name
        )
      `)
      .eq('request_id', requestId)
      .single()

    if (requestError || !request) {
      throw new Error('Payment request not found')
    }

    if (request.status === 'completed') {
      throw new Error('This request has already been completed')
    }

    // Get courses linked to the product
    const { data: productCourses } = await adminClient
      .from('product_courses')
      .select('course_id')
      .eq('product_id', request.product.product_id)

    // Enroll student in all courses linked to the product
    const courseIds = productCourses?.map((c: any) => c.course_id) || []

    for (const courseId of courseIds) {
      // Check if enrollment already exists
      const { data: existing } = await adminClient
        .from('enrollments')
        .select('enrollment_id')
        .eq('user_id', request.user_id)
        .eq('course_id', courseId)
        .single()

      if (!existing) {
        // Create enrollment
        await adminClient
          .from('enrollments')
          .insert({
            user_id: request.user_id,
            course_id: courseId,
            status: 'active',
            enrolled_at: new Date().toISOString()
          })
      }
    }

    // Create transaction record
    await adminClient
      .from('transactions')
      .insert({
        user_id: request.user_id,
        product_id: request.product_id,
        amount: request.payment_amount,
        currency: request.payment_currency,
        payment_method: request.payment_method || 'manual',
        status: 'succeeded',
        metadata: {
          payment_request_id: requestId,
          invoice_number: request.invoice_number,
          processed_manually: true
        }
      })

    // Update request status
    await adminClient
      .from('payment_requests')
      .update({
        status: 'completed',
        payment_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('request_id', requestId)

    // TODO: Send enrollment confirmation email to student

    revalidatePath('/dashboard/admin/payment-requests')
    revalidatePath('/dashboard/student')

    return { success: true }

  } catch (error) {
    console.error('Confirm payment and enroll failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete enrollment'
    }
  }
}

/**
 * Generate invoice for payment request
 */
export async function generateInvoice(
  requestId: number
): Promise<ActionResult<{ invoiceNumber: string; invoiceUrl: string }>> {
  try {
    await verifyAdminAccess()

    const adminClient = createAdminClient()

    // Get payment request
    const { data: request, error: requestError } = await adminClient
      .from('payment_requests')
      .select(`
        *,
        user:profiles(full_name, email),
        product:products(name, price, currency, description)
      `)
      .eq('request_id', requestId)
      .single()

    if (requestError || !request) {
      throw new Error('Payment request not found')
    }

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${requestId}`

    // Update request with invoice number
    await adminClient
      .from('payment_requests')
      .update({
        invoice_number: invoiceNumber,
        invoice_generated_at: new Date().toISOString()
      })
      .eq('request_id', requestId)

    // TODO: Generate PDF invoice using a library like jsPDF or Puppeteer
    // For now, we'll return a placeholder URL

    const invoiceUrl = `/api/invoices/${invoiceNumber}`

    revalidatePath('/dashboard/admin/payment-requests')

    return {
      success: true,
      data: {
        invoiceNumber,
        invoiceUrl
      }
    }

  } catch (error) {
    console.error('Generate invoice failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate invoice'
    }
  }
}
