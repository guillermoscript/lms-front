'use client'

import { useState, FormEvent } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  sendPaymentInstructions,
  confirmPaymentReceived,
  completeAndEnroll,
  cancelPaymentRequest,
  updatePaymentRequest,
  confirmPaymentAndEnroll,
  generateInvoice,
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
  const t = useTranslations('dashboard.admin.paymentRequests')
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
      toast.success(t('dialog.toasts.updateSuccess'))
      router.refresh()
      onOpenChange(false)
    } else {
      toast.error('error' in result ? result.error : t('dialog.toasts.updateError'))
    }

    setLoading(false)
  }

  const handleEnroll = async () => {
    if (!confirm(t('dialog.confirmations.enroll'))) {
      return
    }

    setLoading(true)

    try {
      const result = await confirmPaymentAndEnroll(request.request_id)

      if (result.success) {
        toast.success(t('dialog.toasts.enrollSuccess'))
        router.refresh()
        onOpenChange(false)
      } else {
        const errorMsg = ('error' in result ? (result as any).error : t('dialog.toasts.enrollError')) as string
        toast.error(errorMsg)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('dialog.toasts.enrollError'))
    }

    setLoading(false)
  }

  const handleGenerateInvoice = async () => {
    setLoading(true)

    const result = await generateInvoice(request.request_id)

    if (result.success && result.data) {
      toast.success(t('dialog.toasts.invoiceSuccess', { number: result.data.invoiceNumber }))
      router.refresh()
    } else {
      toast.error('error' in result ? result.error : t('dialog.toasts.invoiceError'))
    }

    setLoading(false)
  }

  const currencySymbol = request.payment_currency === 'usd' ? '$' : '€'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dialog.title', { id: request.request_id })}</DialogTitle>
          <DialogDescription>
            {t('dialog.description', { name: request.user?.full_name || request.contact_name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Request Details */}
          <div className="space-y-3">
            <h3 className="font-semibold">{t('dialog.details.title')}</h3>
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dialog.details.student')}:</span>
                <span className="font-medium">{request.user?.full_name || request.contact_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dialog.details.email')}:</span>
                <span>{request.contact_email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dialog.details.phone')}:</span>
                <span>{request.contact_phone ?? t('dialog.details.notProvided')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dialog.details.product')}:</span>
                <span className="font-medium">{request.product?.name || request.plan?.plan_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dialog.details.amount')}:</span>
                <span className="font-semibold">
                  {currencySymbol}{request.payment_amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dialog.details.date')}:</span>
                <span>{format(new Date(request.created_at), 'PPp')}</span>
              </div>
              {request.invoice_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dialog.details.invoice')}:</span>
                  <span className="font-mono text-xs">{request.invoice_number}</span>
                </div>
              )}
            </div>

            {request.message && (
              <div className="mt-3 p-3 rounded-lg bg-muted">
                <p className="text-sm font-medium mb-1">{t('dialog.details.messageTitle')}:</p>
                <p className="text-sm text-muted-foreground">{request.message}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Management Form */}
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status">{t('dialog.form.status')}</Label>
              <Select
                value={formData.status}
                onValueChange={(value: string | null) => setFormData({ ...formData, status: value || 'pending' })}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t('status.pending')}</SelectItem>
                  <SelectItem value="contacted">{t('status.contacted')}</SelectItem>
                  <SelectItem value="payment_received">{t('status.payment_received')}</SelectItem>
                  <SelectItem value="completed">{t('status.completed')}</SelectItem>
                  <SelectItem value="cancelled">{t('status.cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">{t('dialog.form.method')}</Label>
              <Input
                id="paymentMethod"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                placeholder={t('dialog.form.methodPlaceholder')}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentInstructions">{t('dialog.form.instructions')}</Label>
              <Textarea
                id="paymentInstructions"
                value={formData.paymentInstructions}
                onChange={(e) => setFormData({ ...formData, paymentInstructions: e.target.value })}
                placeholder={t('dialog.form.instructionsPlaceholder')}
                rows={4}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                {t('dialog.form.instructionsDesc')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminNotes">{t('dialog.form.internalNotes')}</Label>
              <Textarea
                id="adminNotes"
                value={formData.adminNotes}
                onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                placeholder={t('dialog.form.internalNotesPlaceholder')}
                rows={2}
                disabled={loading}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? t('dialog.form.updatingButton') : t('dialog.form.updateButton')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                {t('dialog.form.cancel')}
              </Button>
            </div>
          </form>

          <Separator />

          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="font-semibold">{t('dialog.actions.title')}</h3>
            <div className="grid gap-2">
              {!request.invoice_number && (
                <Button
                  variant="outline"
                  onClick={handleGenerateInvoice}
                  disabled={loading}
                  className="w-full"
                >
                  {t('dialog.actions.generateInvoice')}
                </Button>
              )}

              {request.status === 'payment_received' && (
                <Button
                  onClick={handleEnroll}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {t('dialog.actions.confirmEnroll')}
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
                      toast.success(t('dialog.toasts.contactedSuccess'))
                      router.refresh()
                    }
                  }}
                  disabled={loading}
                  className="w-full"
                >
                  {t('dialog.actions.markContacted')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
