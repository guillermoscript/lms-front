import { getMailgunClient, MAILGUN_DOMAIN, EMAIL_FROM } from './client'

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  replyTo?: string
}

/**
 * Send a transactional email via Mailgun.
 * Returns true on success, false if Mailgun is not configured (silent fail in dev).
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!process.env.MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
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
