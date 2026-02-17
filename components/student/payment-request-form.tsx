'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createPaymentRequest } from '@/app/actions/payment-requests'
import { IconLoader2, IconSend, IconCheck, IconAlertCircle } from '@tabler/icons-react'
import { toast } from 'sonner'

interface PaymentRequestFormProps {
  productId: number
  productName: string
  price: string
  currency: string
}

export function PaymentRequestForm({ productId, productName, price, currency }: PaymentRequestFormProps) {
  const router = useRouter()
  const t = useTranslations('components.paymentRequestForm')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    contactName: '',
    contactEmail: '',
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
        productId,
        contactName: formData.contactName.trim(),
        contactEmail: formData.contactEmail.trim(),
        contactPhone: formData.contactPhone.trim() || undefined,
        message: formData.message.trim() || undefined,
      })

      setSuccess(true)
      toast.success(t('success'))

      // Redirect to payments page after 2 seconds
      setTimeout(() => {
        router.push('/dashboard/student/payments')
      }, 2000)
    } catch (error) {
      console.error('Failed to create payment request:', error)
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="pt-10 pb-10 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-green-500/10 p-4 rounded-full border border-green-500/20">
              <IconCheck className="h-12 w-12 text-green-500" />
            </div>
          </div>
          <h3 className="text-2xl font-bold mb-2">{t('successTitle')}</h3>
          <p className="text-muted-foreground mb-6">{t('successDescription')}</p>
          <Button onClick={() => router.push('/dashboard/student/payments')}>
            {t('viewRequests')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Product Info Alert */}
          <Alert>
            <IconAlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-1">{productName}</div>
              <div className="text-sm">
                {t('amount')}: {currency.toUpperCase()} {price}
              </div>
            </AlertDescription>
          </Alert>

          {/* Contact Name */}
          <div className="space-y-2">
            <Label htmlFor="contactName">
              {t('contactName')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contactName"
              value={formData.contactName}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              placeholder={t('contactNamePlaceholder')}
              className={errors.contactName ? 'border-destructive' : ''}
              disabled={loading}
            />
            {errors.contactName && (
              <p className="text-sm text-destructive">{errors.contactName}</p>
            )}
          </div>

          {/* Contact Email */}
          <div className="space-y-2">
            <Label htmlFor="contactEmail">
              {t('contactEmail')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contactEmail"
              type="email"
              value={formData.contactEmail}
              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              placeholder={t('contactEmailPlaceholder')}
              className={errors.contactEmail ? 'border-destructive' : ''}
              disabled={loading}
            />
            {errors.contactEmail && (
              <p className="text-sm text-destructive">{errors.contactEmail}</p>
            )}
            <p className="text-xs text-muted-foreground">{t('contactEmailHint')}</p>
          </div>

          {/* Contact Phone */}
          <div className="space-y-2">
            <Label htmlFor="contactPhone">{t('contactPhone')}</Label>
            <Input
              id="contactPhone"
              type="tel"
              value={formData.contactPhone}
              onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
              placeholder={t('contactPhonePlaceholder')}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">{t('contactPhoneHint')}</p>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">{t('message')}</Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder={t('messagePlaceholder')}
              rows={4}
              disabled={loading}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{t('messageHint')}</p>
          </div>
        </CardContent>

        <CardFooter className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={loading} className="flex-1 gap-2">
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
        </CardFooter>
      </Card>
    </form>
  )
}
