'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email/send'
import { joinedSchoolTemplate } from '@/lib/email/templates/joined-school'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'

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
  const adminClient = await createAdminClient()

  // Read the membership with the admin client, not the caller's RLS client
  // (#550): a removed member's own row may be invisible to them, and a false
  // "no membership" here would fall through to an INSERT that dies on the
  // `tenant_users_unique` constraint with an opaque error. `status` matters as
  // much as existence now that `removeTenantMember` can set it to `removed`.
  const { data: existingMembership } = await adminClient
    .from('tenant_users')
    .select('id, role, status')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existingMembership?.status === 'active') {
    return { success: false, error: 'You are already a member of this school' }
  }

  // A non-active row means the user was removed and is re-joining. That is a
  // reinstatement, not a new membership — but it consumes a seat exactly like
  // a new one, so it goes through the same limit pre-check below rather than
  // around it.
  const isReinstatement = !!existingMembership

  // Check student limit before allowing join
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

  // Check for pending invitation to determine role. A reinstated member keeps
  // the role they held unless a fresh invitation reassigns it.
  const userEmail = user.email?.toLowerCase()
  let assignedRole: 'student' | 'teacher' =
    (existingMembership?.role as 'student' | 'teacher' | undefined) === 'teacher'
      ? 'teacher'
      : 'student'

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
      const { error: invitationError } = await adminClient
        .from('tenant_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)
      // Non-blocking: invitation bookkeeping failure shouldn't stop the join.
      if (invitationError) {
        console.error('Failed to mark invitation as accepted:', invitationError)
      }
    }
  }

  // Add user to tenant (use admin client to bypass RLS — user's JWT has their
  // current tenant_id, not the one they're joining, so RLS would block the insert).
  // A reinstatement updates the surviving row instead, which is why the unique
  // (tenant_id, user_id) constraint is never in play on either path. Note that a
  // removed *admin* comes back as a student or teacher, never an admin: rejoining
  // a school is not a way to restore privilege you were stripped of.
  const { error } = isReinstatement
    ? await adminClient
        .from('tenant_users')
        .update({ role: assignedRole, status: 'active' })
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
    : await adminClient.from('tenant_users').insert({
        tenant_id: tenantId,
        user_id: user.id,
        role: assignedRole,
        status: 'active',
      })

  if (error) {
    console.error('Failed to join school:', error)
    return { success: false, error: 'Failed to join school. Please try again.' }
  }

  // The membership row now exists, so the tenant's student count has changed —
  // reconcile the access cutoff at the moment usage moves rather than waiting up
  // to 24h for the nightly sweep (issue #513). The pre-flight check above blocks
  // at `>=` while `computePlanLimitViolations` flags at `>`, so a legitimate join
  // stops *at* the limit and normally produces no violation; this call exists to
  // catch the cases where the two independent limit computations drift (the
  // hardcoded 50-student fallback above vs. `platform_plans.limits`), and to
  // clear a stale cutoff once a tenant drops back under its limit.
  // Non-blocking, via the shared wrapper: reconciliation must never fail a join
  // that already succeeded.
  await reconcileAccessCutoffSafely(adminClient, tenantId)

  // Create gamification profile for this tenant (ignore if already exists)
  const { error: gamificationError } = await adminClient
    .from('gamification_profiles')
    .upsert(
      { user_id: user.id, tenant_id: tenantId, total_xp: 0, level: 1 },
      { onConflict: 'user_id,tenant_id', ignoreDuplicates: true }
    )
  // Non-blocking: a missing gamification profile is recoverable and shouldn't
  // block the user from joining the school.
  if (gamificationError) {
    console.error('Failed to create gamification profile:', gamificationError)
  }

  // Set app_metadata.tenant_id so the JWT hook includes it in claims. This is
  // critical: if it fails, the user "joins" but their JWT never gets the tenant
  // claim, breaking tenant resolution on the next request — so fail loudly.
  const { error: metaError } = await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: { tenant_id: tenantId },
  })
  if (metaError) {
    console.error('Failed to set tenant_id app_metadata:', metaError)
    return { success: false, error: 'Failed to finalize school membership. Please try again.' }
  }

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
