import { NextRequest, NextResponse } from 'next/server'
import {
  SendEmailHookSignatureError,
  verifySendEmailHookPayload,
} from '@/lib/auth/send-email-hook/verify-signature'
import { isSendEmailHookPayload, type SendEmailHookPayload } from '@/lib/auth/send-email-hook/types'
import { buildAuthEmailLink } from '@/lib/auth/send-email-hook/build-link'
import { resolveTenantIdForAuthEmail } from '@/lib/auth/send-email-hook/resolve-tenant'
import { getSchoolBrand, platformSchoolBrand } from '@/lib/themes/school-brand'
import { authOtpTemplate, type AuthOtpKind } from '@/lib/email/templates/auth-otp'
import { sendEmail } from '@/lib/email/send'

/**
 * Supabase Auth's Send Email hook (issue #776): once enabled in the hosted
 * project (Authentication → Hooks → Send Email), GoTrue POSTs here instead of
 * composing and sending its own default-templated email for sign-up
 * confirmation, magic link, recovery, invite and email-change. This route
 * resolves the school the email should be branded as, renders one of the
 * `lib/email/templates/auth-otp.ts` templates with `school-brand-parts.ts`,
 * and sends it through the existing Mailgun-backed `sendEmail()`.
 *
 * `proxy.ts` never touches this: `/api/*` routes are handled before the
 * intl/auth guards run (they just get `x-tenant-id` set and pass through),
 * so there is nothing to exclude there.
 *
 * Local dev: the hook is commented out in `supabase/config.toml` — enabling
 * it locally means GoTrue stops emailing Inbucket, and this app's local
 * Mailgun is unset too, so nothing would arrive anywhere. See that file for
 * how to turn it on once Mailgun (or another mailer) is configured locally.
 */

const SUPPORTED_ACTION_TYPES = new Set(['signup', 'magiclink', 'recovery', 'invite'])

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  let payload: unknown
  try {
    payload = verifySendEmailHookPayload(rawBody, request.headers)
  } catch (error) {
    const message = error instanceof SendEmailHookSignatureError ? error.message : 'Invalid request'
    console.error('[send-email-hook] signature verification failed:', message)
    return NextResponse.json(
      { error: { http_code: 401, message: 'Invalid signature' } },
      { status: 401 }
    )
  }

  if (!isSendEmailHookPayload(payload)) {
    console.error('[send-email-hook] malformed payload', payload)
    return NextResponse.json(
      { error: { http_code: 400, message: 'Malformed payload' } },
      { status: 400 }
    )
  }

  const { user, email_data: emailData } = payload as SendEmailHookPayload
  const actionType = emailData.email_action_type

  // Types this app has no branded template for (`reauthentication` — an
  // MFA-challenge OTP; MFA is disabled in `config.toml` so this shouldn't
  // fire, but a future type could). Enabling the hook means GoTrue no longer
  // sends anything of its own, and a non-2xx here fails the WHOLE auth
  // request (blocking a signup/reset that has nothing to do with email
  // rendering), so an unsupported type is accepted with no email sent rather
  // than declined — a missing email is recoverable, a blocked login is not.
  if (actionType !== 'email_change' && !SUPPORTED_ACTION_TYPES.has(actionType)) {
    console.warn('[send-email-hook] unsupported email_action_type — accepting without sending:', actionType)
    return NextResponse.json({})
  }

  try {
    const tenantId = await resolveTenantIdForAuthEmail({
      redirectTo: emailData.redirect_to || null,
      userId: user.id,
      userMetadata: user.user_metadata ?? null,
    })
    const brand = tenantId ? await getSchoolBrand(tenantId) : platformSchoolBrand('')
    const schoolName = brand.name || 'LMS Platform'

    // Which (recipient, token_hash) pairs to send. Every type but
    // `email_change` sends one email to `user.email` with `token_hash`.
    // `email_change` can send up to two, and — a documented GoTrue quirk
    // (github.com/supabase/auth#1744) — the token/recipient pairing is
    // REVERSED from what the field names suggest: `token_hash` verifies
    // `user.new_email`, `token_hash_new` verifies `user.email` (the current
    // address). Secure Email Change off means only `token_hash` is present.
    const sends: Array<{ to: string; tokenHash: string; kind: AuthOtpKind }> = []

    if (actionType === 'email_change') {
      if (emailData.token_hash && user.new_email) {
        sends.push({ to: user.new_email, tokenHash: emailData.token_hash, kind: 'email_change_new' })
      }
      if (emailData.token_hash_new) {
        sends.push({ to: user.email, tokenHash: emailData.token_hash_new, kind: 'email_change_current' })
      }
      if (sends.length === 0 && emailData.token_hash) {
        // Secure Email Change disabled, or `new_email` missing — best effort: one email to the current address.
        sends.push({ to: user.email, tokenHash: emailData.token_hash, kind: 'email_change_current' })
      }
    } else {
      sends.push({ to: user.email, tokenHash: emailData.token_hash, kind: actionType as AuthOtpKind })
    }

    if (sends.length === 0) {
      console.error('[send-email-hook] no recipient could be resolved for email_change')
      return NextResponse.json(
        { error: { http_code: 500, message: 'No recipient for email_change' } },
        { status: 500 }
      )
    }

    for (const send of sends) {
      const link = buildAuthEmailLink({
        siteUrl: emailData.site_url,
        redirectTo: emailData.redirect_to || null,
        tokenHash: send.tokenHash,
        type: actionType,
      })
      const localeCandidate =
        (typeof user.user_metadata?.locale === 'string' ? (user.user_metadata.locale as string) : null) ??
        link.locale

      const template = authOtpTemplate({
        kind: send.kind,
        schoolName,
        actionUrl: link.url,
        locale: localeCandidate,
        brand,
      })

      const delivered = await sendEmail({ to: send.to, subject: template.subject, html: template.html })
      if (!delivered) {
        console.error('[send-email-hook] sendEmail() returned false for', send.kind)
        return NextResponse.json(
          { error: { http_code: 500, message: 'Mailer not configured or send failed' } },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({})
  } catch (error) {
    console.error('[send-email-hook] failed to send branded auth email:', error)
    return NextResponse.json(
      { error: { http_code: 500, message: 'Failed to send email' } },
      { status: 500 }
    )
  }
}
