'use client'

import { useState } from 'react'
import { formatDateTime } from '@/lib/format-date-time'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PAYMENT_REQUEST_STATUS_STYLES } from '@/lib/payments/payment-request-status'
import { PaymentRequestDialog } from './payment-request-dialog'

interface PaymentRequest {
  request_id: number
  contact_name: string
  contact_email: string
  contact_phone: string | null
  message: string | null
  status: string
  payment_method: string | null
  payment_instructions: string | null
  payment_amount: number | null
  payment_currency: string | null
  invoice_number: string | null
  admin_notes: string | null
  created_at: string
  user: {
    id: string
    full_name: string
  } | null
  product: {
    product_id: number
    name: string
    price: number
    currency: string
  } | null
  plan: {
    plan_id: number
    plan_name: string
    price: number
    currency: string
  } | null
}

// Assuming PaymentRequestWithUser is equivalent to PaymentRequest for this context,
// or that it's defined elsewhere. If not, this type will be undefined.
type PaymentRequestWithUser = PaymentRequest;

export function PaymentRequestsTable({
  requests,
  timeZone,
}: {
  requests: PaymentRequestWithUser[]
  /** Tenant IANA zone — the same one the student's My Payments page uses (#727). */
  timeZone?: string | null
}) {
  const { locale } = useParams()
  const dateOptions = { locale: (locale as string) || 'en', timeZone }
  const t = useTranslations('dashboard.admin.paymentRequests')
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null)

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">{t('table.noRequests')}</p>
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.headers.id')}</TableHead>
              <TableHead>{t('table.headers.student')}</TableHead>
              <TableHead>{t('table.headers.product')}</TableHead>
              <TableHead>{t('table.headers.amount')}</TableHead>
              <TableHead>{t('table.headers.status')}</TableHead>
              <TableHead>{t('table.headers.invoice')}</TableHead>
              <TableHead>{t('table.headers.date')}</TableHead>
              <TableHead>{t('table.headers.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.request_id}>
                <TableCell className="font-mono text-sm">
                  #{request.request_id}
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{request.user?.full_name || request.contact_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {request.contact_email}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-xs truncate">
                    {request.product?.name || request.plan?.plan_name || '—'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium tabular-nums">
                    {request.payment_currency
                      ? new Intl.NumberFormat(locale as string, {
                          style: 'currency',
                          currency: request.payment_currency.toUpperCase(),
                        }).format(request.payment_amount ?? 0)
                      : '—'}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={PAYMENT_REQUEST_STATUS_STYLES[request.status]}
                  >
                    {t(`status.${request.status}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {request.invoice_number ? (
                    <span className="font-mono text-xs">
                      {request.invoice_number}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm" suppressHydrationWarning>
                    {formatDateTime(request.created_at, { ...dateOptions, precision: 'date' })}
                  </div>
                  <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatDateTime(request.created_at, { ...dateOptions, precision: 'time' })}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedRequest(request)}
                  >
                    {t('table.manage')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selectedRequest && (
        <PaymentRequestDialog
          request={selectedRequest}
          open={!!selectedRequest}
          onOpenChange={(open) => !open && setSelectedRequest(null)}
          timeZone={timeZone}
        />
      )}
    </>
  )
}
