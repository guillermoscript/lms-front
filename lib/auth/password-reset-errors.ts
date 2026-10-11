/** User-facing recovery errors; never expose raw provider messages. */
export function passwordResetErrorKey(error: unknown):
  'rateLimited' | 'delivery' | 'invalidLink' | 'weakPassword' | 'samePassword' | 'generic' {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null
  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'rateLimited'
  if (code === 'email_address_not_authorized' || code === 'hook_timeout' || code === 'hook_timeout_after_retry' || code === 'hook_payload_invalid_content' || code === 'unexpected_failure') return 'delivery'
  if (code === 'otp_expired' || code === 'session_not_found' || code === 'refresh_token_not_found' || code === 'bad_jwt') return 'invalidLink'
  if (code === 'weak_password') return 'weakPassword'
  if (code === 'same_password') return 'samePassword'
  return 'generic'
}
