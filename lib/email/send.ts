import { getMailerStatus } from './status'

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  replyTo?: string
  /** Stable across retries of the same Auth hook to prevent duplicate emails. */
  idempotencyKey?: string
}

/**
 * Send a transactional email via Resend, or Mailgun for existing deployments.
 *
 * Returns true only when the provider accepted the message. Acceptance is not
 * proof of inbox delivery; check the provider's delivery/bounce events. False
 * means the mailer is not configured (see
 * `isMailerConfigured()` in `./status`) or the API call failed. Call sites that
 * tell a person "we emailed X" must read this boolean; the invitation dialog,
 * certificate issuance and course deletion do (#676).
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const status = getMailerStatus()
  if (!status.configured || !status.from) {
    console.warn('[email] Mailer not configured; set RESEND_API_KEY and EMAIL_FROM')
    return false
  }

  try {
    if (process.env.RESEND_API_KEY?.trim()) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json',
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: status.from,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          reply_to: options.replyTo || status.from,
        }),
        signal: AbortSignal.timeout(3500),
      })
      const result: unknown = await response.json()
      if (!response.ok || !result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id) {
        // Provider response bodies can contain recipient data. Log only the
        // HTTP status; inspect details in Resend's dashboard.
        console.error('[email] Resend rejected the message', { status: response.status })
        return false
      }
      console.info('[email] Resend accepted the message', { id: result.id })
      return true
    }

    const { getMailgunClient, MAILGUN_DOMAIN } = await import('./client')
    const client = getMailgunClient()
    await client.messages.create(MAILGUN_DOMAIN, {
      from: status.from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      'h:Reply-To': options.replyTo || status.from,
    })
    return true
  } catch (err) {
    console.error('[email] Failed to send email', { name: err instanceof Error ? err.name : 'UnknownError' })
    return false
  }
}
