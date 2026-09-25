import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { joinedSchoolTemplate } from '@/lib/email/templates/joined-school'
import { getSchoolBrand } from '@/lib/themes/school-brand'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'
import { countTenantUsage, getTenantPlanLimits } from '@/lib/billing/plan-limits'
import { isPlanLimitError, STUDENT_LIMIT_MESSAGE } from '@/lib/billing/plan-limit-error'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'

export type JoinSchoolOutcome =
  | { ok: true; role: 'student' | 'teacher'; emailSent: boolean }
  | {
      ok: false
      code: 'already_member' | 'student_limit' | 'failed' | 'metadata_failed'
      error: string
    }

/**
 * Make `user` an active member of `tenantId` and point their JWT at it.
 *
 * The cookie-free core of `joinCurrentSchool` (#845): the web action wraps it
 * with its session refresh, and `POST /api/tenant/switch` calls it for the
 * native app, which has no subdomain and no cookies. Every read and write goes
 * through the service-role `admin` client — the caller's JWT still names the
 * school they are leaving, so RLS would hide the very rows this touches. The
 * caller has already verified `user`.
 */
export async function joinSchool({
  admin,
  user,
  tenantId,
}: {
  admin: SupabaseClient
  user: { id: string; email?: string | null }
  tenantId: string
}): Promise<JoinSchoolOutcome> {
  // Read the membership with the admin client, not the caller's RLS client
  // (#550): a removed member's own row may be invisible to them, and a false
  // "no membership" here would fall through to an INSERT that dies on the
  // `tenant_users_unique` constraint with an opaque error. `status` matters as
  // much as existence now that `removeTenantMember` can set it to `removed`.
  const { data: existingMembership } = await admin
    .from('tenant_users')
    .select('id, role, status')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existingMembership?.status === 'active') {
    return { ok: false, code: 'already_member', error: 'You are already a member of this school' }
  }

  // A non-active row means the user was removed and is re-joining. That is a
  // reinstatement, not a new membership — but it consumes a seat exactly like
  // a new one, so it goes through the same limit pre-check below rather than
  // around it.
  const isReinstatement = !!existingMembership

  // Check student limit before allowing join. Limit and count come from
  // lib/billing/plan-limits so this pre-check agrees with the billing page and
  // with the `enforce_student_plan_limit` trigger (#658) that backs it: no
  // `is_active` filter on the plan, and a missing limit means unlimited — the
  // old `?? 50` default could refuse a join on a plan the trigger allows.
  const [{ limits }, usage] = await Promise.all([
    getTenantPlanLimits(admin, tenantId),
    countTenantUsage(admin, tenantId),
  ])
  const maxStudents = limits?.max_students ?? -1

  if (maxStudents !== -1 && usage.students >= maxStudents) {
    return { ok: false, code: 'student_limit', error: STUDENT_LIMIT_MESSAGE }
  }

  // Check for pending invitation to determine role. A reinstated member keeps
  // the role they held unless a fresh invitation reassigns it.
  const userEmail = user.email?.toLowerCase()
  let viaInvite = false
  let assignedRole: 'student' | 'teacher' =
    (existingMembership?.role as 'student' | 'teacher' | undefined) === 'teacher'
      ? 'teacher'
      : 'student'

  if (userEmail) {
    const { data: invitation } = await admin
      .from('tenant_invitations')
      .select('id, role')
      .eq('tenant_id', tenantId)
      .eq('email', userEmail)
      .eq('status', 'pending')
      .maybeSingle()

    if (invitation) {
      viaInvite = true
      assignedRole = invitation.role as 'student' | 'teacher'
      // Mark invitation as accepted
      const { error: invitationError } = await admin
        .from('tenant_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)
      // Non-blocking: invitation bookkeeping failure shouldn't stop the join.
      if (invitationError) {
        console.error('Failed to mark invitation as accepted:', invitationError)
      }
    }
  }

  // A reinstatement updates the surviving row instead, which is why the unique
  // (tenant_id, user_id) constraint is never in play on either path. Note that a
  // removed *admin* comes back as a student or teacher, never an admin: rejoining
  // a school is not a way to restore privilege you were stripped of.
  const { error } = isReinstatement
    ? await admin
        .from('tenant_users')
        .update({ role: assignedRole, status: 'active' })
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
    : await admin.from('tenant_users').insert({
        tenant_id: tenantId,
        user_id: user.id,
        role: assignedRole,
        status: 'active',
      })

  if (error) {
    // The pre-check above lost a race for the last seat; the trigger is the
    // authoritative answer and this is the message it stands for.
    if (isPlanLimitError(error)) {
      return { ok: false, code: 'student_limit', error: STUDENT_LIMIT_MESSAGE }
    }
    console.error('Failed to join school:', error)
    return { ok: false, code: 'failed', error: 'Failed to join school. Please try again.' }
  }

  // The membership row now exists, so the tenant's student count has changed —
  // reconcile the access cutoff at the moment usage moves rather than waiting up
  // to 24h for the nightly sweep (issue #513). Non-blocking, via the shared
  // wrapper: reconciliation must never fail a join that already succeeded.
  await reconcileAccessCutoffSafely(admin, tenantId)

  // Create gamification profile for this tenant (ignore if already exists)
  const { error: gamificationError } = await admin
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

  // Critical: if it fails, the user "joins" but their JWT never gets the
  // tenant claim, breaking tenant resolution on the next request — so fail
  // loudly.
  if (!(await setActiveTenant(admin, user.id, tenantId))) {
    return {
      ok: false,
      code: 'metadata_failed',
      error: 'Failed to finalize school membership. Please try again.',
    }
  }

  // Loop A tail. Fired after the membership is real and the JWT claim is set —
  // the earlier `return`s (already a member, seat limit, metadata failure) are
  // all genuine non-joins and must not count.
  await track(
    ANALYTICS_EVENTS.JOIN_SCHOOL_REQUESTED,
    {
      via_invite: viaInvite,
      assigned_role: assignedRole,
      is_reinstatement: isReinstatement,
    },
    { userId: user.id, tenantId, role: assignedRole }
  )

  // Send welcome email (non-blocking). `emailSent` is reported honestly —
  // false when the platform mailer is not configured (#676) — but no caller
  // needs to act on it: the member is already in, there is nothing to share.
  let emailSent = false
  try {
    const [{ data: authUser }, brand] = await Promise.all([
      admin.auth.admin.getUserById(user.id),
      getSchoolBrand(tenantId),
    ])

    if (authUser?.user?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'
      const template = joinedSchoolTemplate({
        studentName: authUser.user.user_metadata?.full_name || authUser.user.email,
        schoolName: brand.name || 'the school',
        dashboardUrl: `${appUrl}/dashboard/student`,
        brand,
      })
      emailSent = await sendEmail({ to: authUser.user.email, ...template })
    }
  } catch (emailErr) {
    console.error('Failed to send welcome email:', emailErr)
  }

  return { ok: true, role: assignedRole, emailSent }
}

/**
 * Point the user's next JWT at `tenantId`: `custom_access_token_hook` reads
 * `app_metadata.tenant_id` into the `tenant_id`/`tenant_role` claims, and
 * `preferred_tenant_id` is the signup-time fallback. Takes effect on the
 * caller's next `refreshSession()`. GoTrue merges both metadata objects key by
 * key, so nothing else in them is touched.
 */
export async function setActiveTenant(
  admin: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { tenant_id: tenantId },
    user_metadata: { preferred_tenant_id: tenantId },
  })
  if (error) console.error('Failed to set tenant_id app_metadata:', error)
  return !error
}

/**
 * Whether a non-member may be joined to `tenantId` without being asked — the
 * same rule `app/[locale]/join-school/page.tsx` applies before it auto-joins
 * (#790), minus the checkout case, which only exists on the web. A seat costs
 * the school, so a user who already belongs somewhere and has no invitation
 * must choose to join explicitly.
 */
export async function canJoinWithoutAsking({
  admin,
  user,
  tenantId,
}: {
  admin: SupabaseClient
  user: { id: string; email?: string | null }
  tenantId: string
}): Promise<boolean> {
  const { data: memberships } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .neq('tenant_id', tenantId)
    .limit(1)
  if ((memberships ?? []).length === 0) return true

  const email = user.email?.toLowerCase()
  if (!email) return false
  const { data: invitation } = await admin
    .from('tenant_invitations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()
  return Boolean(invitation)
}
