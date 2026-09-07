/**
 * Whether the platform mailer can send at all.
 *
 * Every transactional email goes through `sendEmail()`, which needs a Mailgun
 * API key and a sending domain from the runtime environment. This module reads
 * only env presence (no Mailgun import, no secret values), so a server page can
 * show the state to an admin and a call site can tell "nothing was sent" apart
 * from "sent" (#676).
 */
export interface MailerStatus {
  configured: boolean
  /** Sending domain — public information (it is the email's own domain). */
  domain: string | null
  /** From address, or null when the mailer is not configured. */
  from: string | null
}

export function isMailerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN)
}

export function getMailerStatus(env: NodeJS.ProcessEnv = process.env): MailerStatus {
  const configured = isMailerConfigured(env)
  if (!configured) return { configured: false, domain: null, from: null }
  const domain = env.MAILGUN_DOMAIN as string
  return { configured: true, domain, from: env.EMAIL_FROM || `noreply@${domain}` }
}
