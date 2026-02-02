'use client'

import { useState } from 'react'
import { format } from 'date-fns'
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

interface PaymentRequestsTableProps {
  requests: PaymentRequest[]
}

const statusColors = {
  pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  contacted: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  payment_received: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
}

const statusLabels = {
  pending: 'Pending',
  contacted: 'Contacted',
  payment_received: 'Payment Received',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function PaymentRequestsTable({ requests }: PaymentRequestsTableProps) {
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null)

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">No payment requests found</p>
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request ID</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
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
                    {statusLabels[request.status as keyof typeof statusLabels]}
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
                    {format(new Date(request.created_at), 'MMM d, yyyy')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(request.created_at), 'h:mm a')}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedRequest(request)}
                  >
                    Manage
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
