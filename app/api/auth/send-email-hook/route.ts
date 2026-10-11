import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import {
  SendEmailHookSignatureError,
  verifySendEmailHookPayload,
} from '@/lib/auth/send-email-hook/verify-signature'
import { isSendEmailHookPayload, type SendEmailHookPayload } from '@/lib/auth/send-email-hook/types'
import { buildAuthEmailLink } from '@/lib/auth/send-email-hook/build-link'
import { resolveTenantIdForAuthEmail } from '@/lib/auth/send-email-hook/resolve-tenant'
import { getSchoolBrand, platformSchoolBrand } from '@/lib/themes/school-brand'
import { authOtpTemplate, authReauthenticationTemplate, type AuthOtpKind } from '@/lib/email/templates/auth-otp'
import { sendEmail } from '@/lib/email/send'

/**
 * Supabase Auth's Send Email hook (issue #776): once enabled in the hosted
 * project (Authentication → Hooks → Send Email), GoTrue POSTs here instead of
 * composing and sending its own default-templated email for sign-up
 * confirmation, magic link, recovery, invite and email-change. This route
 * resolves the school the email should be branded as, renders one of the
 * `lib/email/templates/auth-otp.ts` templates with `school-brand-parts.ts`,
 * and sends it through `sendEmail()` using Resend's API (or legacy Mailgun).
 *
 * `proxy.ts` never touches this: `/api/*` routes are handled before the
 * intl/auth guards run (they just get `x-tenant-id` set and pass through),
 * so there is nothing to exclude there.
 *
 * Local dev: the hook is commented out in `supabase/config.toml` — enabling
 * it locally means GoTrue stops emailing Inbucket, and this app's local
 * mailer needs credentials first. See docs/AUTH_EMAIL_SETUP.md for setup.
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
    console.error('[send-email-hook] malformed payload')
    return NextResponse.json(
      { error: { http_code: 400, message: 'Malformed payload' } },
      { status: 400 }
    )
  }

  const { user, email_data: emailData } = payload as SendEmailHookPayload
  const actionType = emailData.email_action_type

  // Never acknowledge an email that was not actually handed to a provider.
  // Reauthentication needs its OTP, not a verification link.
  if (actionType !== 'email_change' && actionType !== 'reauthentication' && !SUPPORTED_ACTION_TYPES.has(actionType)) {
    console.error('[send-email-hook] unsupported email action')
    return NextResponse.json(
      { error: { http_code: 400, message: 'Unsupported email action' } },
      { status: 400 }
    )
  }

  try {
    const tenantId = await resolveTenantIdForAuthEmail({
      redirectTo: emailData.redirect_to || null,
      userId: user.id,
      userMetadata: user.user_metadata ?? null,
    })
    const brand = tenantId ? await getSchoolBrand(tenantId) : platformSchoolBrand('')
    const schoolName = brand.name || 'LMS Platform'

    if (actionType === 'reauthentication') {
      if (!emailData.token) {
        return NextResponse.json({ error: { http_code: 400, message: 'Missing reauthentication code' } }, { status: 400 })
      }
      const locale = typeof user.user_metadata?.locale === 'string' ? user.user_metadata.locale : null
      const template = authReauthenticationTemplate({ schoolName, token: emailData.token, locale, brand })
      const idempotencyKey = `auth/${createHash('sha256').update(`reauthentication:${user.email}:${emailData.token}`).digest('hex')}`
      const sent = await sendEmail({ to: user.email, ...template, idempotencyKey })
      return sent
        ? NextResponse.json({})
        : NextResponse.json({ error: { http_code: 500, message: 'Failed to send email' } }, { status: 500 })
    }

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

    // Secure email changes send to two addresses. Parallel sends stay within
    // the hook's HTTP deadline; idempotency makes partial retries safe.
    const deliveries = await Promise.all(sends.map(async (send) => {
      const link = buildAuthEmailLink({
        siteUrl: emailData.site_url,
        redirectTo: emailData.redirect_to || null,
        tokenHash: send.tokenHash,
        type: actionType,
      })
      const localeCandidate = link.locale ??
        (typeof user.user_metadata?.locale === 'string' ? user.user_metadata.locale : null)

      const template = authOtpTemplate({
        kind: send.kind,
        schoolName,
        actionUrl: link.url,
        locale: localeCandidate,
        brand,
      })

      const idempotencyKey = `auth/${createHash('sha256')
        .update(`${send.kind}:${send.to}:${send.tokenHash}`)
        .digest('hex')}`
      const delivered = await sendEmail({
        to: send.to,
        subject: template.subject,
        html: template.html,
        idempotencyKey,
      })
      if (!delivered) {
        console.error('[send-email-hook] sendEmail() returned false for', send.kind)
      }
      return delivered
    }))

    if (deliveries.some((delivered) => !delivered)) {
      return NextResponse.json(
        { error: { http_code: 500, message: 'Mailer not configured or send failed' } },
        { status: 500 }
      )
    }

    return NextResponse.json({})
  } catch (error) {
    console.error('[send-email-hook] failed to send branded auth email', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    return NextResponse.json(
      { error: { http_code: 500, message: 'Failed to send email' } },
      { status: 500 }
    )
  }
}
