/**
 * Whether the platform mailer can send at all.
 *
 * Every transactional email goes through `sendEmail()`. Resend needs an API
 * key and an explicit sender on a verified domain; Mailgun remains supported.
 * This module reads only env presence (no provider imports or secret values), so a server page can
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

/**
 * `Record<string, string | undefined>` rather than `NodeJS.ProcessEnv`: the
 * project augments `ProcessEnv` with required keys, so a test cannot pass a
 * small literal env without spelling out every one of them.
 */
type EnvLike = Record<string, string | undefined>

export function isMailerConfigured(env: EnvLike = process.env): boolean {
  return getMailerStatus(env).configured
}

export function getMailerStatus(env: EnvLike = process.env): MailerStatus {
  const unconfigured = { configured: false, domain: null, from: null }
  const from = env.EMAIL_FROM?.trim()
  // Once Resend is selected, incomplete configuration must fail visibly.
  // Falling back to another provider would hide a broken Resend deployment.
  if (env.RESEND_API_KEY?.trim()) {
    const address = from?.match(/^(?:[^<>\r\n]*<)?([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>?$/)?.[1]
    if (!address) return unconfigured
    return { configured: true, domain: address.split('@')[1], from: from! }
  }
  const domain = env.MAILGUN_DOMAIN?.trim()
  if (!env.MAILGUN_API_KEY?.trim() || !domain) return unconfigured
  return { configured: true, domain, from: from || `noreply@${domain}` }
}
