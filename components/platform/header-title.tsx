'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

/** Section path segment -> key in the `platform.sidebar` namespace. */
const SECTION_KEYS: Record<string, string> = {
  '': 'overview',
  tenants: 'schools',
  revenue: 'revenue',
  payouts: 'payouts',
  billing: 'paymentRequests',
  'billing-health': 'billingHealth',
  plans: 'plans',
  'bank-accounts': 'bankAccounts',
}

/**
 * The top bar names the section the operator is in. The sidebar header already
 * says "Platform", so repeating it here told them nothing.
 */
export function PlatformHeaderTitle() {
  const t = useTranslations('platform.sidebar')
  const pathname = usePathname()
  const afterPlatform = pathname.replace(/^\/(en|es)/, '').replace(/^\/platform\/?/, '')
  const section = afterPlatform.split('/')[0] ?? ''
  const label = t(SECTION_KEYS[section] ?? 'brand')
  return (
    <span className="text-sm font-medium" aria-current="page">
      {label}
    </span>
  )
}
