'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole, isSuperAdmin } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'

export interface PaymentRequestFormData {
  productId?: number
  planId?: number
  contactName: string
  contactEmail: string
  contactPhone?: string
  message?: string
}

export interface PaymentInstructionsData {
  paymentMethod: string
  paymentInstructions: string
  paymentDeadline?: string
  paymentAmount: number
  paymentCurrency: string
}

/**
 * Student creates a payment request for manual/offline payment
 */
export async function createPaymentRequest(data: PaymentRequestFormData) {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  const tenantId = await getCurrentTenantId()

  if (!userId) {
    throw new Error('Not authenticated')
  }

  if (!data.productId && !data.planId) {
    throw new Error('Must provide either productId or planId')
  }

  let paymentAmount: number
  let paymentCurrency: string

  if (data.productId) {
    // Verify product exists and belongs to tenant
    const { data: product } = await supabase
      .from('products')
      .select('product_id, name, price, currency, payment_provider')
      .eq('product_id', data.productId)
      .eq('tenant_id', tenantId)
      .single()

    if (!product) {
      throw new Error('Product not found')
    }

    if (product.payment_provider !== 'manual') {
      throw new Error('This product does not support manual payments')
    }

    paymentAmount = parseFloat(product.price)
    paymentCurrency = product.currency || 'usd'
  } else {
    // Verify plan exists and belongs to tenant
    const { data: plan } = await supabase
      .from('plans')
      .select('plan_id, plan_name, price, currency')
      .eq('plan_id', data.planId!)
      .eq('tenant_id', tenantId)
      .single()

    if (!plan) {
      throw new Error('Plan not found')
    }

    paymentAmount = parseFloat(plan.price)
    paymentCurrency = plan.currency || 'usd'
  }

  // Create payment request
  const { data: request, error } = await supabase
    .from('payment_requests')
    .insert({
      user_id: userId,
      product_id: data.productId || null,
      plan_id: data.planId || null,
      contact_name: data.contactName,
      contact_email: data.contactEmail,
      contact_phone: data.contactPhone || null,
      message: data.message || null,
      status: 'pending',
      payment_amount: paymentAmount,
      payment_currency: paymentCurrency,
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create payment request:', error)
    throw new Error('Failed to create payment request')
  }

  revalidatePath('/dashboard/student/payments')
  return request
}

/**
 * Admin sends payment instructions to student
 */
export async function sendPaymentInstructions(
  requestId: number,
  instructions: PaymentInstructionsData
) {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()
  const superAdmin = await isSuperAdmin()

  if (!userId || (role !== 'admin' && !superAdmin)) {
    throw new Error('Unauthorized')
  }

  // Verify request belongs to tenant
  const { data: request } = await supabase
    .from('payment_requests')
    .select('request_id, status, tenant_id')
    .eq('request_id', requestId)
    .single()

  if (!request || (request.tenant_id !== tenantId && !superAdmin)) {
    throw new Error('Payment request not found or access denied')
  }

  if (request.status !== 'pending') {
    throw new Error('Can only send instructions for pending requests')
  }

  // Update request with payment instructions
  const { error } = await supabase
    .from('payment_requests')
    .update({
      status: 'contacted',
      payment_method: instructions.paymentMethod,
      payment_instructions: instructions.paymentInstructions,
      payment_deadline: instructions.paymentDeadline || null,
      payment_amount: instructions.paymentAmount,
      payment_currency: instructions.paymentCurrency,
      processed_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Failed to send payment instructions:', error)
    throw new Error('Failed to send payment instructions')
  }

  revalidatePath('/dashboard/admin/payment-requests')
  revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)

  return { success: true }
}

/**
 * Admin confirms payment has been received
 */
export async function confirmPaymentReceived(requestId: number, adminNotes?: string) {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()
  const superAdmin = await isSuperAdmin()

  if (!userId || (role !== 'admin' && !superAdmin)) {
    throw new Error('Unauthorized')
  }

  // Verify request belongs to tenant
  const { data: request } = await supabase
    .from('payment_requests')
    .select('request_id, status, tenant_id')
    .eq('request_id', requestId)
    .single()

  if (!request || (request.tenant_id !== tenantId && !superAdmin)) {
    throw new Error('Payment request not found or access denied')
  }

  if (request.status !== 'contacted') {
    throw new Error('Can only confirm payment for requests with instructions sent')
  }

  // Update request status
  const { error } = await supabase
    .from('payment_requests')
    .update({
      status: 'payment_received',
      payment_confirmed_at: new Date().toISOString(),
      admin_notes: adminNotes || null,
      processed_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Failed to confirm payment:', error)
    throw new Error('Failed to confirm payment')
  }

  revalidatePath('/dashboard/admin/payment-requests')
  revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)

  return { success: true }
}

/**
 * Admin completes the request and enrolls student in course
 */
export async function completeAndEnroll(requestId: number) {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()
  const superAdmin = await isSuperAdmin()

  if (!userId || (role !== 'admin' && !superAdmin)) {
    throw new Error('Unauthorized')
  }

  // Get full request details with product and plan joins
  const { data: request, error: fetchError } = await supabase
    .from('payment_requests')
    .select('*, product:products(product_id, name, price, currency), plan:plans(plan_id, plan_name, price, currency)')
    .eq('request_id', requestId)
    .single()

  if (fetchError || !request || (request.tenant_id !== tenantId && !superAdmin)) {
    throw new Error('Payment request not found or access denied')
  }

  if (request.status !== 'payment_received') {
    throw new Error('Can only complete requests with confirmed payment')
  }

  // Use admin client to bypass RLS — admin is inserting transaction/enrollment
  // on behalf of the student (uid() != user_id would fail with regular client)
  const adminClient = await createAdminClient()

  // Create transaction record
  const { data: transaction, error: transactionError } = await adminClient
    .from('transactions')
    .insert({
      user_id: request.user_id,
      product_id: request.product_id || null,
      plan_id: request.plan_id || null,
      amount: request.payment_amount,
      currency: request.payment_currency,
      payment_method: `manual - ${request.payment_method}`,
      status: 'successful',
      tenant_id: tenantId,
    })
    .select()
    .single()

  if (transactionError) {
    console.error('Failed to create transaction:', transactionError)
    throw new Error('Failed to create transaction')
  }

  // Enroll user: call appropriate RPC based on product vs plan
  if (request.product_id) {
    const { error: enrollError } = await adminClient.rpc('enroll_user', {
      _user_id: request.user_id,
      _product_id: request.product_id,
    })
    if (enrollError) {
      console.error('Failed to enroll user:', enrollError)
      throw new Error('Failed to enroll user: ' + enrollError.message)
    }
  } else if (request.plan_id) {
    const { error: subError } = await adminClient.rpc('handle_new_subscription', {
      _user_id: request.user_id,
      _plan_id: request.plan_id,
      _transaction_id: transaction.transaction_id,
    })
    if (subError) {
      console.error('Failed to create subscription:', subError)
      throw new Error('Failed to create subscription: ' + subError.message)
    }
  }

  // Update payment request status
  const { error: updateError } = await adminClient
    .from('payment_requests')
    .update({
      status: 'completed',
      processed_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)
    .eq('tenant_id', tenantId)

  if (updateError) {
    console.error('Failed to complete payment request:', updateError)
    throw new Error('Failed to complete payment request')
  }

  revalidatePath('/dashboard/admin/payment-requests')
  revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)

  return { success: true, transactionId: transaction.transaction_id }
}

/**
 * Generic update function for payment requests (used by dialog)
 */
export async function updatePaymentRequest(
  requestId: number,
  updates: {
    status?: string
    paymentMethod?: string
    paymentInstructions?: string
    adminNotes?: string
  }
) {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()
  const superAdmin = await isSuperAdmin()

  if (!userId || (role !== 'admin' && !superAdmin)) {
    return { success: false, error: 'Unauthorized' }
  }

  // Verify request belongs to tenant
  const { data: request } = await supabase
    .from('payment_requests')
    .select('request_id, tenant_id')
    .eq('request_id', requestId)
    .single()

  if (!request || (request.tenant_id !== tenantId && !superAdmin)) {
    return { success: false, error: 'Payment request not found or access denied' }
  }

  try {
    // If setting status to "completed" and the request has received payment,
    // use the completeAndEnroll flow to actually create the enrollment
    if (updates.status === 'completed') {
      // Fetch current status to check if we should trigger enrollment
      const { data: currentRequest } = await supabase
        .from('payment_requests')
        .select('status, product_id, plan_id')
        .eq('request_id', requestId)
        .eq('tenant_id', tenantId)
        .single()

      if (currentRequest && currentRequest.status === 'payment_received') {
        // Use the proper enrollment flow
        return await completeAndEnroll(requestId)
          .then((result) => ({ success: true }))
          .catch((err) => ({ success: false, error: err instanceof Error ? err.message : 'Failed to complete and enroll' }))
      }

      // If current status is not payment_received but has a product/plan,
      // still trigger enrollment (admin is fast-tracking)
      if (currentRequest && (currentRequest.product_id || currentRequest.plan_id) &&
          currentRequest.status !== 'completed' && currentRequest.status !== 'cancelled') {
        // First set status to payment_received so completeAndEnroll will accept it
        await supabase
          .from('payment_requests')
          .update({
            status: 'payment_received',
            payment_confirmed_at: new Date().toISOString(),
            ...(updates.paymentMethod && { payment_method: updates.paymentMethod }),
            ...(updates.paymentInstructions && { payment_instructions: updates.paymentInstructions }),
            ...(updates.adminNotes && { admin_notes: updates.adminNotes }),
            processed_by: userId!,
            updated_at: new Date().toISOString(),
          })
          .eq('request_id', requestId)
          .eq('tenant_id', tenantId)

        return await completeAndEnroll(requestId)
          .then((result) => ({ success: true }))
          .catch((err) => ({ success: false, error: err instanceof Error ? err.message : 'Failed to complete and enroll' }))
      }
    }

    const { error } = await supabase
      .from('payment_requests')
      .update({
        ...(updates.status && { status: updates.status }),
        ...(updates.paymentMethod && { payment_method: updates.paymentMethod }),
        ...(updates.paymentInstructions && { payment_instructions: updates.paymentInstructions }),
        ...(updates.adminNotes && { admin_notes: updates.adminNotes }),
        processed_by: userId!,
        updated_at: new Date().toISOString(),
      })
      .eq('request_id', requestId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/payment-requests')
    revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)

    return { success: true }
  } catch (error) {
    console.error('Failed to update payment request:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update payment request'
    }
  }
}

/**
 * Alias for completeAndEnroll (used by existing dialog component)
 */
export async function confirmPaymentAndEnroll(requestId: number) {
  return completeAndEnroll(requestId)
}

/**
 * Generate invoice number for payment request
 */
export async function generateInvoice(requestId: number) {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()
  const superAdmin = await isSuperAdmin()

  if (!userId || (role !== 'admin' && !superAdmin)) {
    return { success: false, error: 'Unauthorized' }
  }

  try {
    // Verify request belongs to tenant
    const { data: request } = await supabase
      .from('payment_requests')
      .select('request_id, invoice_number, tenant_id')
      .eq('request_id', requestId)
      .single()

    if (!request || (request.tenant_id !== tenantId && !superAdmin)) {
      return { success: false, error: 'Payment request not found or access denied' }
    }

    if (request.invoice_number) {
      return {
        success: true,
        data: { invoiceNumber: request.invoice_number }
      }
    }

    // Generate invoice number: INV-YYYYMMDD-XXXXX
    const date = new Date()
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
    const randomNum = Math.floor(10000 + Math.random() * 90000)
    const invoiceNumber = `INV-${dateStr}-${randomNum}`

    const { error } = await supabase
      .from('payment_requests')
      .update({
        invoice_number: invoiceNumber,
        invoice_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('request_id', requestId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard/admin/payment-requests')
    revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)

    return {
      success: true,
      data: { invoiceNumber }
    }
  } catch (error) {
    console.error('Failed to generate invoice:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate invoice'
    }
  }
}

/**
 * Student uploads payment proof for a payment request
 */
export async function uploadStudentPaymentProof(requestId: number, formData: FormData) {
  const supabase = await createClient()
  const adminClient = await createAdminClient()
  const userId = await getCurrentUserId()
  const tenantId = await getCurrentTenantId()

  if (!userId) throw new Error('Not authenticated')

  // Verify request belongs to user and tenant
  const { data: request } = await supabase
    .from('payment_requests')
    .select('request_id, user_id, tenant_id')
    .eq('request_id', requestId)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (!request) throw new Error('Payment request not found')

  const file = formData.get('file') as File
  if (!file || file.size === 0) throw new Error('No file provided')
  if (file.size > 10 * 1024 * 1024) throw new Error('File must be less than 10MB')

  const ext = file.name.split('.').pop() || 'bin'
  const path = `student/${tenantId}/${userId}/${requestId}/proof.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(path, file, { upsert: true })

  if (uploadError) {
    console.error('Failed to upload proof:', uploadError)
    throw new Error('Failed to upload file')
  }

  const { data: signedUrlData } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(path, 60 * 60 * 24 * 365) // 1 year

  const proofUrl = signedUrlData?.signedUrl || ''

  await adminClient
    .from('payment_requests')
    .update({ proof_url: proofUrl, updated_at: new Date().toISOString() })
    .eq('request_id', requestId)

  revalidatePath('/dashboard/student/payments')
  return { proofUrl }
}

/**
 * Admin or student cancels a payment request
 */
export async function cancelPaymentRequest(requestId: number, reason?: string) {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  const role = await getUserRole()
  const tenantId = await getCurrentTenantId()
  const superAdmin = await isSuperAdmin()

  if (!userId) {
    throw new Error('Not authenticated')
  }

  // Get request
  const { data: request } = await supabase
    .from('payment_requests')
    .select('request_id, user_id, status, tenant_id')
    .eq('request_id', requestId)
    .single()

  if (!request || (request.tenant_id !== tenantId && !superAdmin)) {
    throw new Error('Payment request not found or access denied')
  }

  // Students can only cancel their own pending/contacted requests
  if (role !== 'admin' && !superAdmin) {
    if (request.user_id !== userId) {
      throw new Error('You can only cancel your own requests')
    }
    if (request.status !== 'pending' && request.status !== 'contacted') {
      throw new Error('Cannot cancel this request')
    }
  }

  // Update status
  const { error } = await supabase
    .from('payment_requests')
    .update({
      status: 'cancelled',
      admin_notes: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Failed to cancel payment request:', error)
    throw new Error('Failed to cancel payment request')
  }

  revalidatePath('/dashboard/admin/payment-requests')
  revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)
  revalidatePath('/dashboard/student/payments')

  return { success: true }
}
