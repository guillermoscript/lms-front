'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole, isSuperAdmin } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'
import { findConflictingSubscription, PARALLEL_SUBSCRIPTION_MESSAGE } from '@/lib/payments/subscription-guard'
import { netOfRefunds } from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track, safeAnalytics } from '@/lib/analytics/server'
import { manualTransactionPaymentMethod } from '@/lib/payments/manual-payment-method'
import { sendEmail } from '@/lib/email/send'
import { bestEffortLocaleOr } from '@/lib/i18n/best-effort-locale'
import { paymentInstructionsTemplate } from '@/lib/email/templates/payment-instructions'
import { getTenantSiteUrl } from '@/lib/platform/tenant-site-url'
import { formatCurrency } from '@/lib/currency'
import { formatDateTime } from '@/lib/format-date-time'
import { getTenantTimeZone } from '@/lib/tenant-timezone'

export interface PaymentRequestFormData {
  productId?: number
  planId?: number
  /** Optional fallback only — identity is derived from the authenticated user. */
  contactName?: string
  /** Optional fallback only — identity is derived from the authenticated user. */
  contactEmail?: string
  contactPhone?: string
  message?: string
}

/**
 * Best-effort in-app notification to a student about a payment-request status
 * change. Mirrors the fan-out shape used by app/actions/admin/notifications.ts:
 * one `notifications` row (tenant-scoped) + one `user_notifications` delivery
 * row. Never throws — notification failure must not fail the caller.
 */
/** Resolve a human item name from a request row with product/plan embeds. */
type RequestWithItemEmbeds = {
  product?: { name?: string | null } | { name?: string | null }[] | null
  plan?: { plan_name?: string | null } | { plan_name?: string | null }[] | null
}
function itemNameFromRequest(request: RequestWithItemEmbeds | null): string {
  const product = Array.isArray(request?.product) ? request.product[0] : request?.product
  const plan = Array.isArray(request?.plan) ? request.plan[0] : request?.plan
  return product?.name || plan?.plan_name || 'your purchase'
}

async function notifyPaymentRequestStatus(params: {
  adminClient: ReturnType<typeof createAdminClient>
  tenantId: string
  studentUserId: string
  createdBy: string
  itemName: string
  status: string
}) {
  const { adminClient, tenantId, studentUserId, createdBy, itemName, status } = params
  try {
    const { data: notification, error } = await adminClient
      .from('notifications')
      .insert({
        title: 'Payment request update',
        content: `Your payment request for ${itemName} is now ${status}`,
        notification_type: 'info',
        priority: 'normal',
        target_type: 'user',
        target_user_ids: [studentUserId],
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: createdBy,
        tenant_id: tenantId,
      })
      .select('id')
      .single()

    if (error || !notification) return

    await adminClient
      .from('user_notifications')
      .insert({ notification_id: notification.id, user_id: studentUserId })
  } catch (err) {
    console.error('Failed to send payment-request notification:', err)
  }
}

/**
 * Best-effort "here is how to pay" email (issue #727). The student copy used
 * to promise this message while nothing sent one. `sendEmail()` returns
 * `false` — and this returns `false` — when Mailgun is not configured (#676);
 * the in-app notification and the My Payments page carry the instructions
 * either way, so a missing mailer never fails the admin's action.
 */
async function emailPaymentInstructions(params: {
  adminClient: ReturnType<typeof createAdminClient>
  tenantId: string
  requestId: number
  studentUserId: string
  itemName: string
  paymentMethod: string | null
  instructions: string
  amount: number | null
  currency: string | null
  deadline: string | null
}): Promise<boolean> {
  const { adminClient, tenantId, requestId, studentUserId } = params
  try {
    if (!params.instructions.trim()) return false

    const [{ data: authUser }, { data: tenant }, timeZone, locale] = await Promise.all([
      adminClient.auth.admin.getUserById(studentUserId),
      adminClient.from('tenants').select('name, slug').eq('id', tenantId).single(),
      getTenantTimeZone(tenantId),
      // The school's own UI language — the closest thing to the reader's that
      // this flow knows, since nothing stores a per-student locale. Sending a
      // LATAM buyer an English email would undo the point of translating the
      // in-app copy (#727).
      bestEffortLocaleOr('en'),
    ])
    const to = authUser?.user?.email
    if (!to) return false

    const template = paymentInstructionsTemplate({
      schoolName: tenant?.name || 'Your school',
      itemName: params.itemName,
      amountLabel: formatCurrency(params.amount ?? 0, params.currency || 'usd'),
      paymentMethod: params.paymentMethod,
      instructions: params.instructions,
      deadlineLabel: params.deadline
        ? formatDateTime(params.deadline, { locale, timeZone })
        : null,
      requestUrl: `${await getTenantSiteUrl(tenant?.slug || 'app')}/dashboard/student/payments/${requestId}`,
      locale,
    })
    return await sendEmail({ to, ...template })
  } catch (err) {
    console.error('Failed to email payment instructions:', err)
    return false
  }
}

export interface PaymentInstructionsData {
  paymentMethod: string
  paymentInstructions: string
  paymentDeadline?: string
  paymentAmount: number
  paymentCurrency: string
}

/**
 * Student creates a payment request for manual/offline payment.
 *
 * Refusals come back as `{ error }` instead of a throw: Next.js replaces a
 * thrown Server Action error's message with a generic digest in production
 * builds, so "This product is free…" would reach the student as "An error
 * occurred" everywhere except `next dev`.
 */
export async function createPaymentRequest(
  data: PaymentRequestFormData,
): Promise<{ request: Awaited<ReturnType<typeof insertPaymentRequest>>; error?: never } | { error: string; request?: never }> {
  try {
    return { request: await insertPaymentRequest(data) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create payment request' }
  }
}

/** Statuses in which a request is still being worked (mirrors the partial unique indexes). */
const OPEN_PAYMENT_REQUEST_STATUSES = ['pending', 'contacted', 'payment_received']

async function findOpenPaymentRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tenantId: string,
  data: PaymentRequestFormData,
) {
  let query = supabase
    .from('payment_requests')
    .select()
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .in('status', OPEN_PAYMENT_REQUEST_STATUSES)
    .limit(1)
  query = data.productId
    ? query.eq('product_id', data.productId).is('plan_id', null)
    : query.eq('plan_id', data.planId!).is('product_id', null)
  const { data: request } = await query.maybeSingle()
  return request
}

async function insertPaymentRequest(data: PaymentRequestFormData) {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  const tenantId = await getCurrentTenantId()

  if (!userId) {
    throw new Error('Not authenticated')
  }

  if (!data.productId && !data.planId) {
    throw new Error('Must provide either productId or planId')
  }

  // Derive identity from the authenticated user — do NOT trust client-sent
  // name/email. Client values are used only as a fallback if profile/auth
  // data is missing.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  const contactName = profile?.full_name?.trim() || data.contactName?.trim() || ''
  const contactEmail = user?.email?.trim() || data.contactEmail?.trim() || ''

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

    // A free offering is stored as price 0 with provider `manual` (the wizard's
    // NOT NULL default). Nothing is owed, so there is nothing to request — the
    // product page offers one-click enrollment instead (#727).
    if (!(parseFloat(product.price) > 0)) {
      throw new Error('This product is free — enroll directly from the product page')
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

    // Parallel-subscription guard (#459): block the manual request up front so
    // the student gets the warning before any admin back-and-forth. Same-plan
    // renewal requests pass.
    const conflict = await findConflictingSubscription(supabase, {
      userId,
      tenantId,
      planId: plan.plan_id,
    })
    if (conflict) {
      throw new Error(PARALLEL_SUBSCRIPTION_MESSAGE)
    }

    paymentAmount = parseFloat(plan.price)
    paymentCurrency = plan.currency || 'usd'
  }

  // One open request per student per item (#754). A double-click or a retry
  // used to leave the admin with duplicate requests, and confirming the second
  // one failed. Returning the open request makes the call idempotent; the
  // partial unique indexes only settle two inserts racing past this read.
  const existing = await findOpenPaymentRequest(supabase, userId, tenantId, data)
  if (existing) return existing

  // Create payment request
  const { data: request, error } = await supabase
    .from('payment_requests')
    .insert({
      user_id: userId,
      product_id: data.productId || null,
      plan_id: data.planId || null,
      contact_name: contactName,
      contact_email: contactEmail,
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
    if (error.code === '23505') {
      const winner = await findOpenPaymentRequest(supabase, userId, tenantId, data)
      if (winner) return winner
    }
    console.error('Failed to create payment request:', error)
    throw new Error('Failed to create payment request')
  }

  // Loop C. The student IS the actor here, so no backdating is needed — unlike
  // every later step in this flow, which runs in an admin's request context
  // hours or days from now.
  await track(
    ANALYTICS_EVENTS.MANUAL_PAYMENT_REQUESTED,
    {
      provider: 'manual',
      amount: paymentAmount,
      currency: paymentCurrency,
      is_subscription: !!data.planId,
      request_id: request.request_id,
      ...(data.productId ? { product_id: data.productId } : {}),
      ...(data.planId ? { plan_id: data.planId } : {}),
    },
    { userId, tenantId }
  )

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
    .select('request_id, status, tenant_id, user_id, product:products(name), plan:plans(plan_name)')
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

  const adminClient = createAdminClient()
  await notifyPaymentRequestStatus({
    adminClient,
    tenantId: request.tenant_id,
    studentUserId: request.user_id,
    createdBy: userId,
    itemName: itemNameFromRequest(request),
    status: 'awaiting payment',
  })

  const emailSent = await emailPaymentInstructions({
    adminClient,
    tenantId: request.tenant_id,
    requestId,
    studentUserId: request.user_id,
    itemName: itemNameFromRequest(request),
    paymentMethod: instructions.paymentMethod || null,
    instructions: instructions.paymentInstructions,
    amount: instructions.paymentAmount,
    currency: instructions.paymentCurrency,
    deadline: instructions.paymentDeadline || null,
  })

  revalidatePath('/dashboard/admin/payment-requests')
  revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)
  revalidatePath('/dashboard/student/payments')

  return { success: true, emailSent }
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

  // Verify request belongs to tenant. `created_at` and the amount columns are
  // selected for the analytics event below — see the attribution note there.
  const { data: request } = await supabase
    .from('payment_requests')
    .select('request_id, status, tenant_id, user_id, created_at, payment_amount, payment_currency, product_id, plan_id, product:products(name), plan:plans(plan_name)')
    .eq('request_id', requestId)
    .single()

  if (!request || (request.tenant_id !== tenantId && !superAdmin)) {
    throw new Error('Payment request not found or access denied')
  }

  if (request.status !== 'contacted') {
    throw new Error('Can only confirm payment for requests with instructions sent')
  }

  // Update request status
  const confirmedAt = new Date().toISOString()
  const { data: confirmed, error } = await supabase
    .from('payment_requests')
    .update({
      status: 'payment_received',
      payment_confirmed_at: confirmedAt,
      admin_notes: adminNotes || null,
      processed_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)
    // The REQUEST's school, not the host the acting admin is on (#745): a super
    // admin passes the read check from any tenant, and filtering by theirs
    // matched nothing and "succeeded" silently.
    .eq('tenant_id', request.tenant_id)
    .select('request_id')

  if (error || !confirmed?.length) {
    console.error('Failed to confirm payment:', error ?? 'no row updated')
    throw new Error('Failed to confirm payment')
  }

  await notifyPaymentRequestStatus({
    adminClient: createAdminClient(),
    tenantId: request.tenant_id,
    studentUserId: request.user_id,
    createdBy: userId,
    itemName: itemNameFromRequest(request),
    status: 'payment received',
  })

  // Loop C, trap 3. This runs in the ADMIN's request context, hours or days
  // after the student's session ended, so two things are deliberate:
  //
  //   - `userId` is the STUDENT's, never `userId` (the admin's). Attributing it
  //     to the admin would make it look like the admin bought the course, and
  //     would fold every school's manual sales onto one or two profiles.
  //   - `timestamp` backdates the event to the original request, so the sale
  //     lands in the cohort that generated it rather than in whichever day the
  //     admin happened to do their paperwork. `hours_to_confirm` and the two
  //     explicit stamps keep the admin-workload reading recoverable, since
  //     backdating alone would erase it.
  await track(
    ANALYTICS_EVENTS.MANUAL_PAYMENT_CONFIRMED,
    {
      provider: 'manual',
      amount: Number(request.payment_amount ?? 0),
      currency: request.payment_currency ?? 'usd',
      is_subscription: !!request.plan_id,
      request_id: requestId,
      original_requested_at: request.created_at,
      confirmed_at: confirmedAt,
      hours_to_confirm: hoursBetween(request.created_at, confirmedAt),
      ...(request.product_id ? { product_id: request.product_id } : {}),
      ...(request.plan_id ? { plan_id: request.plan_id } : {}),
    },
    {
      userId: request.user_id,
      tenantId: request.tenant_id,
      timestamp: request.created_at,
    }
  )

  revalidatePath('/dashboard/admin/payment-requests')
  revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)

  return { success: true }
}

/**
 * Whole hours between two ISO stamps, or `null` when either is missing.
 * `payment_requests.created_at` is nullable, and a fabricated 0 would read as
 * "confirmed instantly" — the opposite of the truth this number exists to tell.
 */
function hoursBetween(from: string | null | undefined, to: string): number | null {
  if (!from) return null
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Number.isFinite(ms) ? Math.round((ms / 3_600_000) * 10) / 10 : null
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

  // Use admin client to bypass RLS — admin is inserting a transaction on
  // behalf of the student (uid() != user_id would fail with a regular client).
  const adminClient = await createAdminClient()

  // Create the transaction. The after_transaction_insert trigger handles
  // enrollment (entitlements + enrollment record / subscription) — the single
  // enrollment path shared with the Stripe webhook and mock checkout.
  const { data: transaction, error: transactionError } = await adminClient
    .from('transactions')
    .insert({
      user_id: request.user_id,
      product_id: request.product_id || null,
      plan_id: request.plan_id || null,
      amount: request.payment_amount,
      currency: request.payment_currency,
      // `manual`, or `manual - <method>` only when the admin typed one — never
      // the literal "manual - null" the Transactions table used to print (#727).
      payment_method: manualTransactionPaymentMethod(request.payment_method),
      status: 'successful',
      // The REQUEST's school, never the acting admin's host (#745) — this row
      // decides whose revenue, payout and fee snapshot the sale is.
      tenant_id: request.tenant_id,
      // Said explicitly rather than left to the column default (#746): a NULL
      // provider silently drops out of any `.eq('payment_provider', 'manual')`.
      payment_provider: 'manual',
    })
    .select()
    .single()

  if (transactionError) {
    console.error('Failed to create transaction:', transactionError)
    throw new Error('Failed to create transaction')
  }

  // Update payment request status
  const { data: completed, error: updateError } = await adminClient
    .from('payment_requests')
    .update({
      status: 'completed',
      processed_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)
    .eq('tenant_id', request.tenant_id)
    .select('request_id')

  if (updateError || !completed?.length) {
    console.error('Failed to complete payment request:', updateError ?? 'no row updated')
    throw new Error('Failed to complete payment request')
  }

  await notifyPaymentRequestStatus({
    adminClient,
    tenantId: request.tenant_id,
    studentUserId: request.user_id,
    createdBy: userId,
    itemName: itemNameFromRequest(request),
    status: 'completed — you now have access',
  })

  // Loop C. THIS is where a manual sale becomes real — the transaction row and,
  // through `after_transaction_insert`, the entitlements. `confirmPaymentReceived`
  // above only records that the admin saw the money arrive; it grants nothing,
  // so `payment_succeeded` there would count sales that never completed.
  //
  // Same trap-3 attribution as that step: the student's id, and backdated to
  // the original request so the sale lands in its own cohort rather than in the
  // admin's paperwork day.
  //
  // Wrapped: the `entitlements` count is an analytics-only read, and the sale
  // is already committed by the time we get here. A failed read must not throw
  // the admin an error for a completion that actually succeeded.
  await safeAnalytics(async () => {
    const provider = (transaction.payment_provider as string | null) ?? 'manual'
    const gross = Number(transaction.amount ?? 0)
    const net = netOfRefunds(gross, transaction.refunded_amount as number | null)
    const snapshot = (transaction.school_percentage_snapshot as number | null) ?? null
    const bearsFee = !!PROVIDER_CAPABILITIES[provider as keyof typeof PROVIDER_CAPABILITIES]?.bearsPlatformFee
    const ctx = {
      userId: request.user_id as string,
      tenantId: request.tenant_id as string,
      timestamp: request.created_at as string | null,
    }

    await track(
      ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
      {
        provider,
        amount_major: net,
        currency: (transaction.currency as string | null) ?? 'usd',
        is_subscription: !!request.plan_id,
        ...(bearsFee
          ? snapshot != null
            ? { platform_fee: Math.round(net * (100 - Number(snapshot))) / 100 }
            : {}
          : { platform_fee: 0 }),
        school_percentage_snapshot: snapshot,
        gross_amount: gross,
        transaction_id: transaction.transaction_id,
        request_id: requestId,
        settlement_path: 'manual',
        original_requested_at: request.created_at,
        hours_to_confirm: hoursBetween(request.created_at, new Date().toISOString()),
        ...(request.product_id ? { product_id: request.product_id } : {}),
        ...(request.plan_id ? { plan_id: request.plan_id } : {}),
      },
      ctx
    )

    const sourceType = request.plan_id ? 'subscription' : 'product'
    const sourceId = request.plan_id ?? request.product_id
    if (sourceId != null) {
      const { count } = await adminClient
        .from('entitlements')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', request.user_id)
        .eq('source_type', sourceType)
        .eq('source_id', sourceId)
        .eq('status', 'active')
      await track(
        ANALYTICS_EVENTS.ENTITLEMENT_GRANTED,
        {
          source_type: sourceType,
          course_count: count ?? 0,
          provider,
          transaction_id: transaction.transaction_id,
        },
        ctx
      )
    }
  }, 'manual payment settlement analytics')

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

  // Verify request belongs to tenant. The extra columns feed the instructions
  // email below — one read instead of a second round trip.
  const { data: request } = await supabase
    .from('payment_requests')
    .select('request_id, tenant_id, user_id, payment_instructions, payment_method, payment_amount, payment_currency, payment_deadline, product:products(name), plan:plans(plan_name)')
    .eq('request_id', requestId)
    .single()

  if (!request || (request.tenant_id !== tenantId && !superAdmin)) {
    return { success: false, error: 'Payment request not found or access denied' }
  }

  // Emailed only when the instructions text actually changed: re-saving the
  // dialog with the same text (to add an internal note, say) must not send
  // the student the same email twice.
  const nextInstructions = updates.paymentInstructions?.trim() || ''
  const instructionsChanged =
    nextInstructions.length > 0 && nextInstructions !== (request.payment_instructions || '').trim()
  const emailAfterSave = async () => {
    if (!instructionsChanged) return false
    return emailPaymentInstructions({
      adminClient: createAdminClient(),
      tenantId: request.tenant_id,
      requestId,
      studentUserId: request.user_id,
      itemName: itemNameFromRequest(request),
      paymentMethod: updates.paymentMethod?.trim() || request.payment_method || null,
      instructions: nextInstructions,
      amount: request.payment_amount,
      currency: request.payment_currency,
      deadline: request.payment_deadline,
    })
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

    const emailSent = await emailAfterSave()

    revalidatePath('/dashboard/admin/payment-requests')
    revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)
    revalidatePath('/dashboard/student/payments')

    return { success: true, emailSent }
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
    .select('request_id, user_id, status, tenant_id, product:products(name), plan:plans(plan_name)')
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

  // Notify the student only when an admin cancelled (not their own cancel).
  if ((role === 'admin' || superAdmin) && request.user_id !== userId) {
    await notifyPaymentRequestStatus({
      adminClient: createAdminClient(),
      tenantId: request.tenant_id,
      studentUserId: request.user_id,
      createdBy: userId,
      itemName: itemNameFromRequest(request),
      status: 'cancelled',
    })
  }

  revalidatePath('/dashboard/admin/payment-requests')
  revalidatePath(`/dashboard/admin/payment-requests/${requestId}`)
  revalidatePath('/dashboard/student/payments')

  return { success: true }
}
