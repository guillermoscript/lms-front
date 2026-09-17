import { Webhook } from 'standardwebhooks'

/** Thrown for every verification failure — missing secret, bad signature, malformed body. */
export class SendEmailHookSignatureError extends Error {}

/**
 * Supabase writes the Send Email hook secret as `v1,whsec_<base64>` (the same
 * format the dashboard shows for every Auth hook). `standardwebhooks`'s
 * `Webhook` constructor only auto-strips a leading `whsec_`, not the `v1,`
 * Supabase prefixes it with, so that part is stripped here.
 */
function decodeHookSecret(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('v1,whsec_')) return trimmed.slice('v1,whsec_'.length)
  if (trimmed.startsWith('v1,')) return trimmed.slice('v1,'.length)
  return trimmed
}

/**
 * Verifies a Send Email hook POST against `SEND_EMAIL_HOOK_SECRET` (Standard
 * Webhooks signature: `webhook-id` / `webhook-timestamp` / `webhook-signature`
 * headers) and returns the parsed JSON body.
 *
 * Throws `SendEmailHookSignatureError` on any failure — unconfigured secret,
 * missing headers, a bad signature, or a body that isn't valid JSON — so the
 * route never half-trusts a request it couldn't verify.
 */
export function verifySendEmailHookPayload(rawBody: string, headers: Headers): unknown {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET
  if (!secret) {
    throw new SendEmailHookSignatureError('SEND_EMAIL_HOOK_SECRET is not configured')
  }

  const headerRecord: Record<string, string> = {}
  headers.forEach((value, key) => {
    headerRecord[key] = value
  })

  try {
    return new Webhook(decodeHookSecret(secret)).verify(rawBody, headerRecord)
  } catch (error) {
    throw new SendEmailHookSignatureError(
      error instanceof Error ? error.message : 'Invalid webhook signature'
    )
  }
}
