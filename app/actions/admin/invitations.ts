'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { sendEmail } from '@/lib/email/send'
import { invitationTemplate } from '@/lib/email/templates/invitation'
import { revalidatePath } from 'next/cache'

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
}) {
  const userRole = await getUserRole()
  if (userRole !== 'admin') {
    return { success: false, error: 'Unauthorized' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
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
      invited_by: user.id,
    })

  if (insertError) {
    console.error('Failed to create invitation:', insertError)
    return { success: false, error: 'Failed to create invitation' }
  }

  // Send email if requested
  if (sendEmailInvite) {
    try {
      const { data: tenant } = await adminClient
        .from('tenants')
        .select('name, slug')
        .eq('id', tenantId)
        .single()

      const { data: inviterProfile } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      const joinUrl = buildJoinUrl(tenant?.slug)

      const template = invitationTemplate({
        schoolName: tenant?.name || 'the school',
        inviterName: inviterProfile?.full_name || 'An administrator',
        role,
        joinUrl,
      })

      await sendEmail({ to: email, ...template })
    } catch (emailErr) {
      console.error('Failed to send invitation email:', emailErr)
      // Invitation was created, email just failed — don't return error
    }
  }

  revalidatePath('/dashboard/admin/users')
  return { success: true }
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

function buildJoinUrl(slug?: string | null): string {
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  const protocol = platformDomain.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${slug || 'app'}.${platformDomain}/join-school`
}
