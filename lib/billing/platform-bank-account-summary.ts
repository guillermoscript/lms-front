/**
 * One-line identifier for an account in the admin table: whatever a payer would
 * copy first (account number, email, Pay ID, phone). Pure; client-safe.
 */
import type { PlatformAccountKind } from '@/lib/billing/platform-bank-account-input'

export function platformAccountSummary(a: {
  kind: PlatformAccountKind
  accountNumber: string | null
  email: string | null
  document: string | null
  extraInstructions: string | null
}): string {
  switch (a.kind) {
    case 'bank':
    case 'binance':
      return a.accountNumber ?? a.email ?? ''
    case 'pago_movil':
      return [a.accountNumber, a.document].filter(Boolean).join(' · ')
    case 'cash':
      return a.extraInstructions ?? ''
    default:
      return a.email ?? ''
  }
}
