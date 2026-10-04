'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { IconBuildingBank, IconCheck } from '@tabler/icons-react'
import { ProofUpload } from '@/components/shared/proof-upload'
import { useLocale, useTranslations } from 'next-intl'

interface ManualTransferFormProps {
  planName: string
  amount: number
  interval: string
  onSubmit: (bankReference: string, notes: string) => Promise<void>
  onProofUpload?: (file: File) => Promise<void>
  onSuccess?: () => void
  onCancel: () => void
}

export function ManualTransferForm({
  planName,
  amount,
  interval,
  onSubmit,
  onProofUpload,
  onSuccess,
  onCancel,
}: ManualTransferFormProps) {
  const t = useTranslations('dashboard.admin.billing.manualTransfer')
  const locale = useLocale()
  // The amount was printed as `$9/month` regardless of the school's language or
  // the plan's currency (#726).
  const amountLabel = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
  const intervalLabel = interval === 'yearly' ? t('intervalYearly') : t('intervalMonthly')

  const [bankReference, setBankReference] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit(bankReference, notes)
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <IconCheck className="h-6 w-6 text-success" />
          </div>
          <div className="text-center">
            <h3 className="font-semibold">{t('submittedTitle')}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t('submittedDescription')}</p>
          </div>
          <Button variant="outline" onClick={onSuccess || onCancel}>{t('backToBilling')}</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconBuildingBank className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>
          {t('description', { plan: planName, interval: intervalLabel, amount: amountLabel })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md bg-muted p-3 text-sm">
            <p>{t('stepsIntro')}</p>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-muted-foreground">
              <li>{t('step1')}</li>
              <li>{t('step2')}</li>
              <li>{t('step3')}</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankRef">{t('bankRefLabel')}</Label>
            <Input
              id="bankRef"
              placeholder={t('bankRefPlaceholder')}
              value={bankReference}
              onChange={(e) => setBankReference(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('bankRefHint')}</p>
          </div>

          {onProofUpload && (
            <ProofUpload
              onUpload={onProofUpload}
              label={t('proofLabel')}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">{t('notesLabel')}</Label>
            <Textarea
              id="notes"
              placeholder={t('notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? t('submitting') : t('submit')}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
