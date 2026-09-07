'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { isEmailVerified, EMAIL_NOT_VERIFIED_ERROR } from '@/lib/auth/require-verified-email'
import { sendEmail } from '@/lib/email/send'
import { invitationTemplate } from '@/lib/email/templates/invitation'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
import { revalidatePath } from 'next/cache'
import { getTenantSiteUrl } from '@/lib/platform/tenant-site-url'

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
  /** The school's join page, so the UI can hand the admin a link that works. */
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

  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) {
    return { success: false, error: 'Not authenticated' }
  }

  const tenantId = await getCurrentTenantId()
  const adminClient = await createAdminClient()

  // Check for existing pending invitation (unique constraint will also catch this)
  const { data: existingInvite } = await adminClient
    .from('tenant_invitations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email.toLowerCase())
    .eq('status', 'pending')
    .single()

  if (existingInvite) {
    return { success: false, error: 'An invitation is already pending for this email' }
  }

  // Create the invitation
  const { error: insertError } = await adminClient
    .from('tenant_invitations')
    .insert({
      tenant_id: tenantId,
      email: email.toLowerCase(),
      role,
      invited_by: userId,
    })

  if (insertError) {
    console.error('Failed to create invitation:', insertError)
    return { success: false, error: 'Failed to create invitation' }
  }

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('name, slug')
    .eq('id', tenantId)
    .single()
  const joinUrl = await buildJoinUrl(tenant?.slug)

  // Send email if requested. The invitation row exists either way; what the
  // caller learns is whether the email really went out, never a guess.
  let emailSent = false
  if (sendEmailInvite) {
    try {
      const { data: inviterProfile } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single()

      const template = invitationTemplate({
        schoolName: tenant?.name || 'the school',
        inviterName: inviterProfile?.full_name || 'An administrator',
        role,
        joinUrl,
      })

      emailSent = await sendEmail({ to: email, ...template })
    } catch (emailErr) {
      console.error('Failed to send invitation email:', emailErr)
      // Invitation was created, email just failed — don't return error
    }
  }

  // §9.5 — how schools actually grow their roster. No email, ever: the address
  // is PII and the event only needs the shape of the invite.
  await track(
    ANALYTICS_EVENTS.STUDENT_INVITED,
    { invited_role: role, email_sent: emailSent },
    { userId, tenantId, role: 'admin' }
  )

  revalidatePath('/dashboard/admin/users')
  return { success: true, emailSent, joinUrl }
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

/**
 * `https://<slug>.<platform domain>/join-school` in production; scheme and
 * port from the current request otherwise. The old builder hardcoded `https`
 * and no port unless the domain said `localhost`, so on `lvh.me` (local, CI)
 * every copied/emailed link was `https://school.lvh.me/join-school` — a page
 * nobody could open (#673).
 */
async function buildJoinUrl(slug?: string | null): Promise<string> {
  return `${await getTenantSiteUrl(slug || 'app')}/join-school`
}
