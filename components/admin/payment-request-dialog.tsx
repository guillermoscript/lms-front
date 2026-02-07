'use client'

import { useState, FormEvent } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  updatePaymentRequest,
  confirmPaymentAndEnroll,
  generateInvoice
} from '@/app/actions/payment-requests'

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

interface PaymentRequestDialogProps {
  request: PaymentRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PaymentRequestDialog({
  request,
  open,
  onOpenChange
}: PaymentRequestDialogProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    status: request.status || 'pending',
    paymentMethod: request.payment_method || '',
    paymentInstructions: request.payment_instructions || '',
    adminNotes: request.admin_notes || ''
  })

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const result = await updatePaymentRequest(request.request_id, {
      status: formData.status,
      paymentMethod: formData.paymentMethod,
      paymentInstructions: formData.paymentInstructions,
      adminNotes: formData.adminNotes
    })

    if (result.success) {
      toast.success('Payment request updated successfully')
      router.refresh()
      onOpenChange(false)
    } else {
      toast.error(result.error || 'Failed to update request')
    }

    setLoading(false)
  }

  const handleEnroll = async () => {
    if (!confirm('Are you sure you want to enroll this student? This will grant them access to the courses.')) {
      return
    }

    setLoading(true)

    const result = await confirmPaymentAndEnroll(request.request_id)

    if (result.success) {
      toast.success('Student enrolled successfully!')
      router.refresh()
      onOpenChange(false)
    } else {
      toast.error(result.error || 'Failed to enroll student')
    }

    setLoading(false)
  }

  const handleGenerateInvoice = async () => {
    setLoading(true)

    const result = await generateInvoice(request.request_id)

    if (result.success && result.data) {
      toast.success(`Invoice ${result.data.invoiceNumber} generated!`)
      router.refresh()
    } else {
      toast.error('error' in result ? result.error : 'Failed to generate invoice')
    }

    setLoading(false)
  }

  const currencySymbol = request.payment_currency === 'usd' ? '$' : '€'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment Request #{request.request_id}</DialogTitle>
          <DialogDescription>
            Manage payment request from {request.user.full_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Request Details */}
          <div className="space-y-3">
            <h3 className="font-semibold">Request Details</h3>
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student:</span>
                <span className="font-medium">{request.user.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span>{request.user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span>{request.contact_phone ?? 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product:</span>
                <span className="font-medium">{request.product.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-semibold">
                  {currencySymbol}{request.payment_amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Request Date:</span>
                <span>{format(new Date(request.created_at), 'PPp')}</span>
              </div>
              {request.invoice_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice:</span>
                  <span className="font-mono text-xs">{request.invoice_number}</span>
                </div>
              )}
            </div>

            {request.message && (
              <div className="mt-3 p-3 rounded-lg bg-muted">
                <p className="text-sm font-medium mb-1">Student Message:</p>
                <p className="text-sm text-muted-foreground">{request.message}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Management Form */}
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: string | null) => setFormData({ ...formData, status: value || 'pending' })}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="payment_received">Payment Received</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Input
                id="paymentMethod"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                placeholder="e.g., Bank Transfer, Wire, Cash"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentInstructions">Payment Instructions</Label>
              <Textarea
                id="paymentInstructions"
                value={formData.paymentInstructions}
                onChange={(e) => setFormData({ ...formData, paymentInstructions: e.target.value })}
                placeholder="Enter payment instructions to send to the student..."
                rows={4}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Include bank details, wire instructions, or payment address
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminNotes">Internal Notes</Label>
              <Textarea
                id="adminNotes"
                value={formData.adminNotes}
                onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                placeholder="Internal notes (not visible to student)..."
                rows={2}
                disabled={loading}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Updating...' : 'Update Request'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>

          <Separator />

          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="font-semibold">Quick Actions</h3>
            <div className="grid gap-2">
              {!request.invoice_number && (
                <Button
                  variant="outline"
                  onClick={handleGenerateInvoice}
                  disabled={loading}
                  className="w-full"
                >
                  Generate Invoice
                </Button>
              )}

              {request.status === 'payment_received' && (
                <Button
                  onClick={handleEnroll}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  Confirm Payment & Enroll Student
                </Button>
              )}

              {request.status === 'pending' && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    setFormData({ ...formData, status: 'contacted' })
                    // Auto-save when marking as contacted
                    const result = await updatePaymentRequest(request.request_id, {
                      status: 'contacted'
                    })
                    if (result.success) {
                      toast.success('Marked as contacted')
                      router.refresh()
                    }
                  }}
                  disabled={loading}
                  className="w-full"
                >
                  Mark as Contacted
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
