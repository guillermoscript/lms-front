import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { joinedSchoolTemplate } from '@/lib/email/templates/joined-school'
import { getSchoolBrand } from '@/lib/themes/school-brand'
import { reconcileAccessCutoffSafely } from '@/lib/billing/access-cutoff'
import { countTenantUsage, getTenantPlanLimits } from '@/lib/billing/plan-limits'
import { isPlanLimitError, STUDENT_LIMIT_MESSAGE } from '@/lib/billing/plan-limit-error'
import { isTenantBannedError } from '@/lib/tenant/ban'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
import { parseInviteToken } from '@/lib/tenant/invitation-token'

export const BANNED_MESSAGE = 'You were removed from this school and cannot rejoin. Contact the school if you think this is a mistake.'

export type JoinSchoolOutcome =
  | { ok: true; role: 'student' | 'teacher' | 'admin'; emailSent: boolean }
  | {
      ok: false
      code: 'already_member' | 'student_limit' | 'failed' | 'metadata_failed' | 'banned'
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
  inviteToken,
}: {
  admin: SupabaseClient
  user: { id: string; email?: string | null }
  tenantId: string
  /**
   * The secret from the invitation link (`?invite=<token>`). An invitation is
   * consumed ONLY when this matches a pending, unexpired invitation of this
   * school AND the signed-in account's email is the invited address. Email
   * alone never grants an invited role (including admin): sign-up does not
   * verify the address, so anyone could register it first.
   */
  inviteToken?: string | null
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

  // A banned user is refused before anything else (#892): before the seat
  // pre-check, and above all before a pending invitation is consumed — an
  // invitation addressed to a banned email must stay inert. The
  // `guard_tenant_ban` trigger refuses the write anyway; this is the message.
  if (existingMembership?.status === 'banned') {
    return { ok: false, code: 'banned', error: BANNED_MESSAGE }
  }

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

  // The role comes from an invitation only when the caller presents its token.
  // A reinstated member keeps the role they held unless a fresh invitation
  // reassigns it.
  let viaInvite = false
  let claimedInvitationId: string | null = null
  let assignedRole: 'student' | 'teacher' | 'admin' =
    (existingMembership?.role as 'student' | 'teacher' | undefined) === 'teacher'
      ? 'teacher'
      : 'student'

  const token = parseInviteToken(inviteToken)
  const userEmail = user.email?.trim().toLowerCase()
  if (token && userEmail) {
    // Claim atomically: token, tenant, address, status and expiry are all
    // matched in the UPDATE's WHERE, so a token is spent exactly once even
    // under a race, and nothing is compared in JS. Invitation emails are stored
    // lowercased (issueInvitation).
    const { data: claimed, error: claimError } = await admin
      .from('tenant_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('token', token)
      .eq('email', userEmail)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .select('id, role')
      .maybeSingle()
    if (claimError) {
      console.error('Failed to claim invitation:', claimError)
    } else if (claimed) {
      viaInvite = true
      claimedInvitationId = claimed.id as string
      assignedRole =
        claimed.role === 'admin' ? 'admin' : claimed.role === 'teacher' ? 'teacher' : 'student'
    }
  }

  // The invitation was spent before the membership write below; give it back if
  // that write fails, so a seat-limit race does not burn the invitee's link.
  const releaseInvitation = async () => {
    if (!claimedInvitationId) return
    const { error: releaseError } = await admin
      .from('tenant_invitations')
      .update({ status: 'pending', accepted_at: null })
      .eq('id', claimedInvitationId)
      .eq('status', 'accepted')
    if (releaseError) console.error('Failed to release invitation:', releaseError)
  }

  // A reinstatement updates the surviving row instead, which is why the unique
  // (tenant_id, user_id) constraint is never in play on either path. Note that a
  // removed *admin* comes back as a student or teacher, never an admin: rejoining
  // a school is not a way to restore privilege you were stripped of. The one way
  // back to admin is an explicit pending admin invitation (#984, a super admin
  // handing a school to its owner), which sets `assignedRole` above.
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
    await releaseInvitation()
    // The pre-check above lost a race for the last seat; the trigger is the
    // authoritative answer and this is the message it stands for.
    if (isPlanLimitError(error)) {
      return { ok: false, code: 'student_limit', error: STUDENT_LIMIT_MESSAGE }
    }
    // Lost a race with a ban that landed after the read above.
    if (isTenantBannedError(error)) {
      return { ok: false, code: 'banned', error: BANNED_MESSAGE }
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
 * the school, so a user who already belongs somewhere and holds no valid
 * invitation token must choose to join explicitly.
 */
export async function canJoinWithoutAsking({
  admin,
  user,
  tenantId,
  inviteToken,
}: {
  admin: SupabaseClient
  user: { id: string; email?: string | null }
  tenantId: string
  inviteToken?: string | null
}): Promise<boolean> {
  const { data: memberships } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .neq('tenant_id', tenantId)
    .limit(1)
  if ((memberships ?? []).length === 0) return true

  return hasValidInvitation({ admin, user, tenantId, inviteToken })
}

/**
 * Read-only twin of the claim in `joinSchool`: is `inviteToken` a pending,
 * unexpired invitation of this school addressed to this account's email? Used
 * to decide whether to join silently; it spends nothing.
 */
export async function hasValidInvitation({
  admin,
  user,
  tenantId,
  inviteToken,
}: {
  admin: SupabaseClient
  user: { id: string; email?: string | null }
  tenantId: string
  inviteToken?: string | null
}): Promise<boolean> {
  const token = parseInviteToken(inviteToken)
  const email = user.email?.trim().toLowerCase()
  if (!token || !email) return false
  const { data: invitation } = await admin
    .from('tenant_invitations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('token', token)
    .eq('email', email)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return Boolean(invitation)
}
