'use client'

import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { IconInfoCircle } from '@tabler/icons-react'
import { formatMoney } from '@/lib/payments/format-money'
import { TransferReference } from './bank-transfer-details'

/** Only what the notice renders (serialized from the server card). */
export interface OpenFeeRequest {
  id: string
  amount: number
  currency: string
  requestedAt: string
}

/**
 * A transfer is already waiting for confirmation, so a second one would be
 * refused (409 `fee_request_open`). Says so up front; compose the bank
 * details as children; `reference` is that request's own payment reference.
 */
export function OpenRequestNotice({ request, reference, children }: { request: OpenFeeRequest; /** This request's payment reference (FEES-<SLUG>-<id suffix>). */ reference: string; children?: ReactNode }) {
  const t = useTranslations('platformFees.payNow')
  const locale = useLocale()
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(request.requestedAt))
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm" role="status" data-testid="fee-pay-now-open-request">
      <p className="flex gap-2">
        <IconInfoCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{t('openRequest', { amount: formatMoney(request.amount, request.currency, locale), date })}</span>
      </p>
      {reference ? <TransferReference value={reference} /> : null}
      {children}
    </div>
  )
}
