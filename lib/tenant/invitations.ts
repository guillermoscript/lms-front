import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { invitationTemplate } from '@/lib/email/templates/invitation'
import { getSchoolBrand } from '@/lib/themes/school-brand'
import { getTenantSiteUrl } from '@/lib/platform/tenant-site-url'

export type InvitationRole = 'student' | 'teacher' | 'admin'

export interface IssueInvitationResult {
  ok: boolean
  error?: string
  /**
   * Whether an email actually left the server. `false` when the caller did not
   * ask for one, when Mailgun is not configured (`sendEmail()` returns false),
   * or when the send threw. The invitation row exists either way.
   */
  emailSent: boolean
  /** The school's join page, so the UI can hand over a link that works. */
  joinUrl: string
}

/**
 * `https://<slug>.<platform domain>/join-school` in production; scheme and
 * port from the current request otherwise (#673).
 */
export async function buildJoinUrl(slug?: string | null): Promise<string> {
  return `${await getTenantSiteUrl(slug || 'app')}/join-school`
}

/**
 * Insert a pending invitation and optionally email it. Authorisation is the
 * caller's: `createInvitation` (school admin) and `createSchoolOnBehalf`
 * (super admin) each verify who is asking before they get here.
 */
export async function issueInvitation({
  admin,
  tenantId,
  email,
  role,
  invitedBy,
  sendEmailInvite,
  inviterName,
}: {
  admin: SupabaseClient
  tenantId: string
  email: string
  role: InvitationRole
  invitedBy: string
  sendEmailInvite: boolean
  inviterName?: string
}): Promise<IssueInvitationResult> {
  const normalizedEmail = email.toLowerCase()

  // Check for existing pending invitation (unique constraint will also catch this)
  const { data: existingInvite } = await admin
    .from('tenant_invitations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingInvite) {
    return {
      ok: false,
      error: 'An invitation is already pending for this email',
      emailSent: false,
      joinUrl: '',
    }
  }

  const { error: insertError } = await admin.from('tenant_invitations').insert({
    tenant_id: tenantId,
    email: normalizedEmail,
    role,
    invited_by: invitedBy,
  })

  if (insertError) {
    console.error('Failed to create invitation:', insertError)
    return { ok: false, error: 'Failed to create invitation', emailSent: false, joinUrl: '' }
  }

  const { data: tenant } = await admin.from('tenants').select('name, slug').eq('id', tenantId).single()
  const joinUrl = await buildJoinUrl(tenant?.slug)

  // The invitation row exists either way; what the caller learns is whether
  // the email really went out, never a guess.
  let emailSent = false
  if (sendEmailInvite) {
    try {
      const [inviterProfile, brand] = await Promise.all([
        inviterName
          ? Promise.resolve(null)
          : admin.from('profiles').select('full_name').eq('id', invitedBy).single(),
        getSchoolBrand(tenantId),
      ])

      const template = invitationTemplate({
        schoolName: brand.name || tenant?.name || 'the school',
        inviterName: inviterName || inviterProfile?.data?.full_name || 'An administrator',
        role,
        joinUrl,
        brand,
      })

      emailSent = await sendEmail({ to: email, ...template })
    } catch (emailErr) {
      console.error('Failed to send invitation email:', emailErr)
      // Invitation was created, email just failed — don't report an error
    }
  }

  return { ok: true, emailSent, joinUrl }
}
