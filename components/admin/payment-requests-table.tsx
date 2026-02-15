'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
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
  payment_amount: number
  payment_currency: string
  invoice_number: string | null
  admin_notes: string | null
  created_at: string
  user: {
    id: string
    full_name: string
    email: string
  }
  product: {
    product_id: number
    name: string
    price: number
    currency: string
  }
}

// Assuming PaymentRequestWithUser is equivalent to PaymentRequest for this context,
// or that it's defined elsewhere. If not, this type will be undefined.
type PaymentRequestWithUser = PaymentRequest;

const statusColors = {
  pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  contacted: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  payment_received: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
}

export function PaymentRequestsTable({
  requests,
}: {
  requests: PaymentRequestWithUser[]
}) {
  const { locale } = useParams()
  const dateLocale = locale === 'es' ? es : enUS
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
                    <div className="font-medium">{request.user.full_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {request.user.email}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-xs truncate">
                    {request.product.name}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {request.payment_currency === 'usd' ? '$' : '€'}
                    {request.payment_amount.toFixed(2)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={statusColors[request.status as keyof typeof statusColors]}
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
                  <div className="text-sm">
                    {format(new Date(request.created_at), 'MMM d, yyyy', { locale: dateLocale })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(request.created_at), 'h:mm a', { locale: dateLocale })}
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
        />
      )}
    </>
  )
}
