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
import { createPaymentRequest, uploadStudentPaymentProof } from '@/app/actions/payment-requests'
import { useTranslations } from 'next-intl'
import { ProofUpload } from '@/components/shared/proof-upload'

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
  const t = useTranslations('components.manualPayment')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  })
  const [loading, setLoading] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await createPaymentRequest({
        productId,
        contactName: formData.name,
        contactEmail: formData.email,
        contactPhone: formData.phone,
        message: formData.message
      })

      // Upload proof if one was selected
      if (proofFile && result.request_id) {
        const fd = new FormData()
        fd.append('file', proofFile)
        await uploadStudentPaymentProof(result.request_id, fd)
      }

      toast.success(t('success'))
      onOpenChange(false)
      setFormData({ name: '', email: '', phone: '', message: '' })
      setProofFile(null)
    } catch {
      toast.error(t('error'))
    }

    setLoading(false)
  }

  const currencySymbol = productCurrency === 'usd' ? '$' : '€'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t.rich('description', {
              productName: productName,
              symbol: currencySymbol,
              price: productPrice,
              strong: (chunks) => <strong>{chunks}</strong>
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              {t('fullName')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('fullNamePlaceholder')}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              {t('email')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t('emailPlaceholder')}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t('phone')}</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder={t('phonePlaceholder')}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">{t('message')}</Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder={t('messagePlaceholder')}
              rows={3}
              disabled={loading}
            />
          </div>

          <ProofUpload
            onUpload={async (file) => { setProofFile(file) }}
            label={t('proofLabel') || 'Payment Proof (optional)'}
            disabled={loading}
          />

          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-semibold mb-2">{t('whatHappensNext')}</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• {t('step1')}</li>
              <li>• {t('step2')}</li>
              <li>• {t('step3')}</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? t('sending') : t('submit')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
