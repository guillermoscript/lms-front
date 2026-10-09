/**
 * Where a school sends a platform-fee bank transfer (#929). Free text from the
 * server-only env var `PLATFORM_FEE_BANK_INSTRUCTIONS` (multi-line; unset =
 * none). Never `NEXT_PUBLIC_`: it is read on the server and handed to the
 * dialog as a prop. Nothing here logs the value.
 */

const MAX_LENGTH = 2000

/** Trimmed, LF-normalised, capped instructions, or `null` when unset/blank. */
export function getPlatformFeeBankInstructions(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.PLATFORM_FEE_BANK_INSTRUCTIONS
  if (!raw) return null
  // .env files carry multi-line values as a literal `\n`.
  const text = raw.replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
  return text ? text.slice(0, MAX_LENGTH) : null
}

/**
 * Reference the school quotes on the transfer so the platform can match it.
 * `requestId` is known only after the request is registered.
 */
export function feeTransferReference(tenantSlug: string, requestId?: string | null): string {
  const base = `FEES-${tenantSlug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  const suffix = requestId ? requestId.replace(/-/g, '').slice(0, 8).toUpperCase() : ''
  return suffix ? `${base}-${suffix}` : base
}
