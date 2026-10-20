'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { IconGift, IconInfoCircle } from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { buildCompedCardModel } from '@/lib/billing/comped-card'
import type { BillingMode } from '@/lib/billing/billing-mode'

interface CompedPlanCardProps {
  billingMode: BillingMode
  planName: string
  compedUntil: string | null
  feePercent: number
}

/**
 * Transparency card: `comped` sees what they were given and its end date (the only
 * upsell they get); `internal` sees a calm note with no CTA; `paid` renders nothing.
 */
export function CompedPlanCard({ billingMode, planName, compedUntil, feePercent }: CompedPlanCardProps) {
  const t = useTranslations('dashboard.admin.billing.comped')
  const locale = useLocale()

  if (billingMode === 'internal') {
    return (
      <p
        data-testid="internal-plan-note"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <IconInfoCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('internalNote')}
      </p>
    )
  }
  if (billingMode !== 'comped') return null

  const model = buildCompedCardModel({ compedUntil, feePercent, locale })

  return (
    <Card data-testid="comped-plan-card">
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <IconGift className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-medium text-pretty">
              {model.hasExpiry
                ? t('summaryUntil', { plan: planName, date: model.untilLabel ?? '', fee: model.feeLabel })
                : t('summaryNoExpiry', { plan: planName, fee: model.feeLabel })}
            </p>
            {model.expired && (
              <p className="mt-1 text-muted-foreground">{t('expiredHint')}</p>
            )}
          </div>
        </div>
        <Button size="sm" className="shrink-0" nativeButton={false} render={<Link href="/dashboard/admin/billing/upgrade" />}>
          {t('cta')}
        </Button>
      </CardContent>
    </Card>
  )
}
