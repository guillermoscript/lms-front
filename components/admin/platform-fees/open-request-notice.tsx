'use client'

import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { IconInfoCircle } from '@tabler/icons-react'
import { formatMoney } from '@/lib/payments/format-money'

/** Only what the notice renders (serialized from the server card). */
export interface OpenFeeRequest {
  requestId: string
  amount: number
  currency: string
  createdAt: string
}

/**
 * A transfer is already waiting for confirmation, so a second one would be
 * refused (409 `fee_request_open`). Says so up front; compose the bank
 * details + that request's reference as children.
 */
export function OpenRequestNotice({ request, children }: { request: OpenFeeRequest; children?: ReactNode }) {
  const t = useTranslations('platformFees.payNow')
  const locale = useLocale()
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(request.createdAt))
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm" role="status" data-testid="fee-pay-now-open-request">
      <p className="flex gap-2">
        <IconInfoCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{t('openRequest', { amount: formatMoney(request.amount, request.currency, locale), date })}</span>
      </p>
      {children}
    </div>
  )
}
