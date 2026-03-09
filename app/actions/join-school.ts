'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email/send'
import { joinedSchoolTemplate } from '@/lib/email/templates/joined-school'

/**
 * Join the current tenant as a student
 */
export async function joinCurrentSchool() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const tenantId = await getCurrentTenantId()

  // Check if user is already a member
  const { data: existingMembership } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .single()

  if (existingMembership) {
    return { success: false, error: 'You are already a member of this school' }
  }

  // Check student limit before allowing join
  const adminClient = await createAdminClient()
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single()

  const planSlug = tenant?.plan || 'free'
  const { data: platformPlan } = await adminClient
    .from('platform_plans')
    .select('limits')
    .eq('slug', planSlug)
    .eq('is_active', true)
    .single()

  const maxStudents = (platformPlan?.limits as { max_students?: number })?.max_students ?? 50

  if (maxStudents !== -1) {
    const { count } = await adminClient
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'student')
      .eq('status', 'active')

    if ((count || 0) >= maxStudents) {
      return {
        success: false,
        error: 'This school has reached its student limit. Please contact the school administrator.',
      }
    }
  }

  // Check for pending invitation to determine role
  const userEmail = user.email?.toLowerCase()
  let assignedRole: 'student' | 'teacher' = 'student'

  if (userEmail) {
    const { data: invitation } = await adminClient
      .from('tenant_invitations')
      .select('id, role')
      .eq('tenant_id', tenantId)
      .eq('email', userEmail)
      .eq('status', 'pending')
      .single()

    if (invitation) {
      assignedRole = invitation.role as 'student' | 'teacher'
      // Mark invitation as accepted
      await adminClient
        .from('tenant_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)
    }
  }

  // Add user to tenant (use admin client to bypass RLS — user's JWT has their
  // current tenant_id, not the one they're joining, so RLS would block the insert)
  const { error } = await adminClient
    .from('tenant_users')
    .insert({
      tenant_id: tenantId,
      user_id: user.id,
      role: assignedRole,
      status: 'active',
    })

  if (error) {
    console.error('Failed to join school:', error)
    return { success: false, error: 'Failed to join school. Please try again.' }
  }

  // Create gamification profile for this tenant (ignore if already exists)
  await adminClient
    .from('gamification_profiles')
    .upsert(
      { user_id: user.id, tenant_id: tenantId, total_xp: 0, level: 1 },
      { onConflict: 'user_id,tenant_id', ignoreDuplicates: true }
    )

  // Update user's preferred tenant
  await supabase.auth.updateUser({
    data: { preferred_tenant_id: tenantId }
  })

  // Refresh session to get updated JWT claims
  await supabase.auth.refreshSession()

  revalidatePath('/dashboard/student')
  revalidatePath('/join-school')

  // Send welcome email (non-blocking)
  try {
    const adminClient = createAdminClient()
    const { data: authUser } = await adminClient.auth.admin.getUserById(user.id)
    const { data: tenantRow } = await adminClient
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single()

    if (authUser?.user?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
      const template = joinedSchoolTemplate({
        studentName: authUser.user.user_metadata?.full_name || authUser.user.email,
        schoolName: tenantRow?.name || 'the school',
        dashboardUrl: `${appUrl}/dashboard/student`,
      })
      await sendEmail({ to: authUser.user.email, ...template })
    }
  } catch (emailErr) {
    console.error('Failed to send welcome email:', emailErr)
  }

  return { success: true }
}

/**
 * Get user's school memberships
 */
export async function getUserSchoolMemberships() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, memberships: [] }
  }

  const { data: memberships } = await supabase
    .from('tenant_users')
    .select(`
      tenant_id,
      role,
      status,
      joined_at,
      tenants (
        id,
        name,
        slug,
        description
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })

  return {
    success: true,
    memberships: memberships || []
  }
}

/**
 * Switch to a different school
 */
export async function switchSchool(tenantId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Verify user is a member of the target tenant
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!membership) {
    return { success: false, error: 'You are not a member of this school' }
  }

  // Update preferred tenant
  await supabase.auth.updateUser({
    data: { preferred_tenant_id: tenantId }
  })

  // Refresh session
  await supabase.auth.refreshSession()

  return { success: true }
}
