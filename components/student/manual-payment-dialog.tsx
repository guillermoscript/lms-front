'use client'

import { useState, FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createPaymentRequest } from '@/app/actions/payment-requests'

interface ManualPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  productPrice: number
  productCurrency: string
  productId: number
}

export function ManualPaymentDialog({
  open,
  onOpenChange,
  productName,
  productPrice,
  productCurrency,
  productId
}: ManualPaymentDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const result = await createPaymentRequest({
      productId,
      contactName: formData.name,
      contactEmail: formData.email,
      contactPhone: formData.phone,
      message: formData.message
    })

    if (result.success) {
      toast.success('Payment request sent! We will contact you shortly with payment instructions.')
      onOpenChange(false)
      // Reset form
      setFormData({ name: '', email: '', phone: '', message: '' })
    } else {
      toast.error(result.error || 'Failed to send request. Please try again.')
    }

    setLoading(false)
  }

  const currencySymbol = productCurrency === 'usd' ? '$' : '€'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Request Payment Information</DialogTitle>
          <DialogDescription>
            Fill out this form to receive payment instructions for <strong>{productName}</strong> ({currencySymbol}{productPrice})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number (optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 234 567 8900"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Additional Message (optional)</Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Any questions or special requests..."
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-semibold mb-2">What happens next?</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• We'll send you payment instructions via email</li>
              <li>• Choose your preferred payment method (bank transfer, invoice, etc.)</li>
              <li>• Once payment is confirmed, you'll get instant access</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Sending...' : 'Request Payment Info'}
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
      </DialogContent>
    </Dialog>
  )
}
