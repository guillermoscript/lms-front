import { getMailgunClient, MAILGUN_DOMAIN, EMAIL_FROM } from './client'
import { isMailerConfigured } from './status'

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  replyTo?: string
}

/**
 * Send a transactional email via Mailgun.
 *
 * Returns true only when Mailgun accepted the message. False means nothing
 * reached the recipient — either the mailer is not configured (see
 * `isMailerConfigured()` in `./status`) or the API call failed. Call sites that
 * tell a person "we emailed X" must read this boolean; the invitation dialog,
 * certificate issuance and course deletion do (#676).
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!isMailerConfigured() || !MAILGUN_DOMAIN) {
    console.warn('[email] Mailgun not configured — skipping email to', options.to)
    return false
  }

  try {
    const client = getMailgunClient()
    await client.messages.create(MAILGUN_DOMAIN, {
      from: EMAIL_FROM,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      'h:Reply-To': options.replyTo || EMAIL_FROM,
    })
    return true
  } catch (err) {
    console.error('[email] Failed to send email:', err)
    return false
  }
}
