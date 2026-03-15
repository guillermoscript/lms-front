'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { createPaymentRequest } from '@/app/actions/payment-requests'
import { IconLoader2, IconSend, IconCheck, IconArrowLeft } from '@tabler/icons-react'
import { toast } from 'sonner'

interface PaymentRequestFormProps {
  productId?: number
  planId?: number
  productName: string
  price: string
  currency: string
  userName?: string
  userEmail?: string
}

export function PaymentRequestForm({ productId, planId, productName, price, currency, userName, userEmail }: PaymentRequestFormProps) {
  const router = useRouter()
  const t = useTranslations('components.paymentRequestForm')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    contactName: userName || '',
    contactEmail: userEmail || '',
    contactPhone: '',
    message: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.contactName.trim()) {
      newErrors.contactName = t('errors.nameRequired')
    }

    if (!formData.contactEmail.trim()) {
      newErrors.contactEmail = t('errors.emailRequired')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
      newErrors.contactEmail = t('errors.emailInvalid')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error(t('validationError'))
      return
    }

    setLoading(true)

    try {
      await createPaymentRequest({
        productId: productId || undefined,
        planId: planId || undefined,
        contactName: formData.contactName.trim(),
        contactEmail: formData.contactEmail.trim(),
        contactPhone: formData.contactPhone.trim() || undefined,
        message: formData.message.trim() || undefined,
      })

      setSuccess(true)
      toast.success(t('success'))

      setTimeout(() => {
        router.push('/dashboard/student/payments')
      }, 2500)
    } catch (error) {
      console.error('Failed to create payment request:', error)
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  // ─── Success state ───
  if (success) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-16 text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <IconCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold">{t('successTitle')}</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {t('successDescription')}
        </p>
        <Button
          className="mt-8"
          variant="outline"
          onClick={() => router.push('/dashboard/student/payments')}
        >
          {t('viewRequests')}
        </Button>
      </div>
    )
  }

  // ─── Form ───
  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="border-b border-border px-6 py-5 sm:px-8">
          <h2 className="text-base font-semibold">{t('title')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>

        {/* Fields */}
        <div className="space-y-5 px-6 py-6 sm:px-8">
          {/* Order line — compact summary */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-sm font-medium">{productName}</span>
            <span className="text-sm font-bold tabular-nums">
              {price}
            </span>
          </div>

          {/* Name + Email — side by side on wider screens */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contactName" className="text-xs font-medium">
                {t('contactName')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contactName"
                value={formData.contactName}
                onChange={(e) => {
                  setFormData({ ...formData, contactName: e.target.value })
                  if (errors.contactName) setErrors({ ...errors, contactName: '' })
                }}
                placeholder={t('contactNamePlaceholder')}
                aria-invalid={!!errors.contactName}
                disabled={loading}
              />
              {errors.contactName && (
                <p className="text-xs text-destructive">{errors.contactName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contactEmail" className="text-xs font-medium">
                {t('contactEmail')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => {
                  setFormData({ ...formData, contactEmail: e.target.value })
                  if (errors.contactEmail) setErrors({ ...errors, contactEmail: '' })
                }}
                placeholder={t('contactEmailPlaceholder')}
                aria-invalid={!!errors.contactEmail}
                disabled={loading}
                readOnly={!!userEmail}
                className={userEmail ? 'bg-muted' : ''}
              />
              {errors.contactEmail && (
                <p className="text-xs text-destructive">{errors.contactEmail}</p>
              )}
              <p className="text-[11px] text-muted-foreground">{t('contactEmailHint')}</p>
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone" className="text-xs font-medium">
              {t('contactPhone')}
            </Label>
            <Input
              id="contactPhone"
              type="tel"
              value={formData.contactPhone}
              onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
              placeholder={t('contactPhonePlaceholder')}
              disabled={loading}
            />
            <p className="text-[11px] text-muted-foreground">{t('contactPhoneHint')}</p>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label htmlFor="message" className="text-xs font-medium">
              {t('message')}
            </Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder={t('messagePlaceholder')}
              rows={3}
              disabled={loading}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">{t('messageHint')}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconArrowLeft className="h-3.5 w-3.5" />
            {t('cancel')}
          </button>

          <Button type="submit" disabled={loading} className="gap-2 px-6">
            {loading ? (
              <>
                <IconLoader2 className="h-4 w-4 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              <>
                <IconSend className="h-4 w-4" />
                {t('submit')}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
