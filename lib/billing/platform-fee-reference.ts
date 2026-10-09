/** Transfer references for platform-fee bank transfers (#929). Pure; safe in client bundles. */

/**
 * Reference the school quotes on the transfer so the platform can match it.
 * `requestId` is known only after the request is registered.
 */
export function feeTransferReference(tenantSlug: string, requestId?: string | null): string {
  const base = `FEES-${tenantSlug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  return requestId ? withRequestSuffix(base, requestId) : base
}

/**
 * The reference once the request exists: `<tenantReference>-<first 8 of the
 * request id>`, or the bare request id when the tenant reference is unknown.
 */
export function withRequestSuffix(tenantReference: string | null, requestId: string): string {
  const suffix = requestId.replace(/-/g, '').slice(0, 8).toUpperCase()
  return tenantReference ? `${tenantReference}-${suffix}` : requestId
}
