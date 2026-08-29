'use client'

import { usePathname } from 'next/navigation'

const SECTION_LABELS: Record<string, string> = {
  '': 'Overview',
  tenants: 'Schools',
  revenue: 'Revenue',
  payouts: 'Payouts',
  billing: 'Payment requests',
  'billing-health': 'Billing health',
  plans: 'Plans',
  referrals: 'Referrals',
}

/**
 * The top bar names the section the operator is in. The sidebar header already
 * says "Platform", so repeating it here told them nothing.
 */
export function PlatformHeaderTitle() {
  const pathname = usePathname()
  const afterPlatform = pathname.replace(/^\/(en|es)/, '').replace(/^\/platform\/?/, '')
  const section = afterPlatform.split('/')[0] ?? ''
  const label = SECTION_LABELS[section] ?? 'Platform'
  return (
    <span className="text-sm font-medium" aria-current="page">
      {label}
    </span>
  )
}
