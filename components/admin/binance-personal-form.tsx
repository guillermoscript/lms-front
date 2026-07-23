'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setBinancePersonalCredentials } from '@/app/actions/admin/settings'
import { toast } from 'sonner'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface BinancePersonalFormProps {
  initialPayId: string | null
  hasCredentials: boolean
}

export default function BinancePersonalForm({ initialPayId, hasCredentials }: BinancePersonalFormProps) {
  const t = useTranslations('dashboard.admin.settings.form.binancePersonal')
  const [payId, setPayId] = useState(initialPayId || '')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const result = await setBinancePersonalCredentials(payId, apiKey, apiSecret)
      if (result.success) {
        toast.success(t('success'))
        // Clear secret inputs after a successful save — they are never echoed back.
        setApiKey('')
        setApiSecret('')
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('keyWarning')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="binance_pay_id">{t('payIdLabel')}</Label>
        <Input
          id="binance_pay_id"
          value={payId}
          onChange={(e) => setPayId(e.target.value)}
          placeholder={t('payIdPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          disabled={isSubmitting}
        />
        <p className="text-sm text-muted-foreground">{t('payIdHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="binance_api_key">{t('apiKeyLabel')}</Label>
        <Input
          id="binance_api_key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasCredentials ? t('unchangedPlaceholder') : t('apiKeyPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="binance_api_secret">{t('apiSecretLabel')}</Label>
        <Input
          id="binance_api_secret"
          type="password"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          placeholder={hasCredentials ? t('unchangedPlaceholder') : t('apiSecretPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          disabled={isSubmitting}
        />
        {hasCredentials && (
          <p className="text-sm text-muted-foreground">{t('credentialsSaved')}</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  )
}
