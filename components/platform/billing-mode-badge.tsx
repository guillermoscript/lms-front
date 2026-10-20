import { Badge } from '@/components/ui/badge'
import { normalizeBillingMode } from '@/lib/billing/billing-mode'

/** Paid is the default and shows a quiet dash; comped / internal are called out in words. */
export function BillingModeBadge({ mode }: { mode: string | null | undefined }) {
  const m = normalizeBillingMode(mode)
  if (m === 'paid') return <span className="text-xs text-muted-foreground">Paid</span>
  return (
    <Badge variant={m === 'internal' ? 'default' : 'secondary'} className="capitalize">
      {m}
    </Badge>
  )
}
