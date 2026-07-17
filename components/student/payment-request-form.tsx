'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ProofUpload } from '@/components/shared/proof-upload'
import { createPaymentRequest, uploadStudentPaymentProof } from '@/app/actions/payment-requests'
import { IconLoader2, IconSend, IconCheck, IconArrowLeft, IconInfoCircle } from '@tabler/icons-react'
import { toast } from 'sonner'

interface PaymentRequestFormProps {
  productId?: number
  planId?: number
  productName: string
  price: string
  currency: string
  userName?: string
  userEmail?: string
  /** Tenant's free-text "how to pay" instructions, shown up front when set. */
  instructions?: string
  /** 'page' renders full card chrome; 'dialog' drops the outer card + header. */
  variant?: 'page' | 'dialog'
  /** Called after a successful submit (dialog uses it to close). */
  onSuccess?: () => void
}

export function PaymentRequestForm({
  productId,
  planId,
  productName,
  price,
  userName,
  userEmail,
  instructions,
  variant = 'page',
  onSuccess,
}: PaymentRequestFormProps) {
  const router = useRouter()
  const t = useTranslations('components.paymentRequestForm')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    contactPhone: '',
    message: '',
  })
  const [proofFile, setProofFile] = useState<File | null>(null)

  const isDialog = variant === 'dialog'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const request = await createPaymentRequest({
        productId: productId || undefined,
        planId: planId || undefined,
        // Identity is derived server-side from the authenticated user; these
        // are optional fallbacks only.
        contactName: userName?.trim() || undefined,
        contactEmail: userEmail?.trim() || undefined,
        contactPhone: formData.contactPhone.trim() || undefined,
        message: formData.message.trim() || undefined,
      })

      // Upload proof if one was selected
      if (proofFile && request?.request_id) {
        const fd = new FormData()
        fd.append('file', proofFile)
        await uploadStudentPaymentProof(request.request_id, fd)
      }

      toast.success(t('success'))

      if (isDialog) {
        onSuccess?.()
        return
      }

      setSuccess(true)
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

  // ─── Success state (page only) ───
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

  // Fields shared by both variants
  const fields = (
    <div className={isDialog ? 'space-y-5' : 'space-y-5 px-6 py-6 sm:px-8'}>
      {/* Order line — compact summary */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
        <span className="text-sm font-medium">{productName}</span>
        <span className="text-sm font-bold tabular-nums">{price}</span>
      </div>

      {/* How to pay — tenant instructions, shown BEFORE submitting */}
      {instructions && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <IconInfoCircle className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">{t('howToPayTitle')}</p>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {instructions}
          </p>
        </div>
      )}

      {/* Known identity — read-only */}
      <div className="grid gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:grid-cols-2">
        {userName && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('contactName')}
            </p>
            <p className="text-sm font-medium">{userName}</p>
          </div>
        )}
        {userEmail && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('contactEmail')}
            </p>
            <p className="text-sm font-medium break-all">{userEmail}</p>
          </div>
        )}
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

      {/* Payment proof (optional) */}
      <ProofUpload
        onUpload={async (file) => { setProofFile(file) }}
        label={t('proofLabel')}
        disabled={loading}
      />
    </div>
  )

  const submitButton = (
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
  )

  // ─── Dialog variant — no outer card/header, caller supplies those ───
  if (isDialog) {
    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        {fields}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onSuccess?.()}
            disabled={loading}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('cancel')}
          </button>
          {submitButton}
        </div>
      </form>
    )
  }

  // ─── Page variant ───
  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="border-b border-border px-6 py-5 sm:px-8">
          <h2 className="text-base font-semibold">{t('title')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>

        {fields}

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

          {submitButton}
        </div>
      </div>
    </form>
  )
}
