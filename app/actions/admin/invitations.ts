'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { isEmailVerified, EMAIL_NOT_VERIFIED_ERROR } from '@/lib/auth/require-verified-email'
import { issueInvitation, buildJoinUrl } from '@/lib/tenant/invitations'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
import { revalidatePath } from 'next/cache'

export interface CreateInvitationResult {
  success: boolean
  error?: string
  /**
   * Whether an email actually left the server. `false` when the admin did not
   * ask for one, when Mailgun is not configured (`sendEmail()` then returns
   * false and logs), or when the Mailgun call failed. The dialog uses this to
   * say "email not sent — share this link" instead of "Invitation sent!" (#673,
   * the invitation slice of #676).
   */
  emailSent?: boolean
  /** This invitation's join link (`/join-school?invite=<token>`), to share. */
  joinUrl?: string
}

/**
 * Create an invitation and optionally send an email.
 * The invitation record ensures the user gets the correct role when they join.
 */
export async function createInvitation({
  email,
  role,
  sendEmailInvite,
}: {
  email: string
  role: 'student' | 'teacher'
  sendEmailInvite: boolean
}): Promise<CreateInvitationResult> {
  const userRole = await getUserRole()
  if (userRole !== 'admin') {
    return { success: false, error: 'Unauthorized' }
  }

  if (!(await isEmailVerified())) {
    return { success: false, error: EMAIL_NOT_VERIFIED_ERROR }
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return { success: false, error: 'Not authenticated' }
  }

  const tenantId = await getCurrentTenantId()
  const adminClient = await createAdminClient()

  const result = await issueInvitation({
    admin: adminClient,
    tenantId,
    email,
    role,
    invitedBy: userId,
    sendEmailInvite,
  })
  if (!result.ok) {
    return { success: false, error: result.error }
  }

  // §9.5 — how schools actually grow their roster. No email, ever: the address
  // is PII and the event only needs the shape of the invite.
  await track(
    ANALYTICS_EVENTS.STUDENT_INVITED,
    { invited_role: role, email_sent: result.emailSent },
    { userId, tenantId, role: 'admin' }
  )

  revalidatePath('/dashboard/admin/users')
  return { success: true, emailSent: result.emailSent, joinUrl: result.joinUrl }
}

/**
 * Get the join URL for the current school (for WhatsApp/link sharing).
 */
export async function getSchoolJoinUrl() {
  const tenantId = await getCurrentTenantId()
  const adminClient = await createAdminClient()

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single()

  return buildJoinUrl(tenant?.slug)
}
