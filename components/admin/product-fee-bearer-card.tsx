'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateProductFeeBearer } from '@/app/actions/admin/products'
import { feeBreakdown, type FeeBearer } from '@/lib/payments/fee-bearer'

interface ProductFeeBearerCardProps {
  productId: number
  initialBearer: FeeBearer
  price: number
  currency: string
  /** The tenant's current platform cut, 0–100. */
  platformPercentage: number
  /** Whether the product's provider can pass the fee to the buyer (`canPassFeeToStudent`). */
  providerSupportsStudentBearer: boolean
}

/**
 * Fee-bearer setting with a live breakdown (issue #927): service price,
 * platform fee, what the customer pays, what the school receives. The numbers
 * come from the same `feeBreakdown()` the checkout routes charge with.
 */
export function ProductFeeBearerCard({
  productId,
  initialBearer,
  price,
  currency,
  platformPercentage,
  providerSupportsStudentBearer,
}: ProductFeeBearerCardProps) {
  const t = useTranslations('dashboard.admin.products.edit.feeBearer')
  const locale = useLocale()
  const router = useRouter()
  const [bearer, setBearer] = useState<FeeBearer>(initialBearer)
  const [saved, setSaved] = useState<FeeBearer>(initialBearer)
  const [isPending, startTransition] = useTransition()

  const format = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() }).format(value)

  const isFree = !(price > 0)
  const disabled = isFree || !providerSupportsStudentBearer
  // An unsupported provider charges the school-bears amount no matter what is stored.
  const effective: FeeBearer = disabled ? 'school' : bearer
  const breakdown = feeBreakdown(price, platformPercentage, effective, currency)

  function save() {
    startTransition(async () => {
      const result = await updateProductFeeBearer(productId, bearer)
      if (result.success) {
        setSaved(bearer)
        toast.success(t('saved'))
        // Re-read the product (price, provider, split) on the server so the
        // breakdown reflects what is stored now, not what this tab loaded with.
        // The page keys this card on those inputs, so changed ones remount it.
        router.refresh()
      } else {
        toast.error(t('saveError'))
      }
    })
  }

  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: t('price'), value: format(breakdown.price) },
    { label: t('platformFee', { percentage: platformPercentage }), value: format(breakdown.platformFee) },
    { label: t('customerPays'), value: format(breakdown.customerPays), strong: true },
    { label: t('youReceive'), value: format(breakdown.schoolReceives), strong: true },
  ]

  return (
    <Card data-testid="fee-bearer-card">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <RadioGroup
            value={bearer}
            onValueChange={(value) => setBearer(value as FeeBearer)}
            disabled={disabled || isPending}
            aria-label={t('title')}
          >
            {(['school', 'student'] as const).map((option) => (
              <Label
                key={option}
                htmlFor={`fee-bearer-${option}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary"
              >
                <RadioGroupItem id={`fee-bearer-${option}`} value={option} className="mt-0.5" />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{t(option)}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t(`${option}Hint`)}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>

          {isFree ? (
            <p className="text-xs text-muted-foreground">{t('freeProduct')}</p>
          ) : !providerSupportsStudentBearer ? (
            <p className="text-xs text-muted-foreground">{t('providerUnsupported')}</p>
          ) : !(platformPercentage > 0) ? (
            <p className="text-xs text-muted-foreground">{t('noFee')}</p>
          ) : null}

          <Button
            onClick={save}
            disabled={disabled || isPending || bearer === saved}
            data-testid="fee-bearer-save"
          >
            {t('save')}
          </Button>
        </div>

        <dl className="divide-y rounded-lg border bg-muted/30" data-testid="fee-bearer-breakdown">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className={row.strong ? 'text-sm font-semibold tabular-nums' : 'text-sm tabular-nums'}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
