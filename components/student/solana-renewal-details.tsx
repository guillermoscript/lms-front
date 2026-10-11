'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { IconAlertTriangle, IconCheck, IconLoader2, IconRefresh } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface SolanaRenewalDetailsProps {
  subscriptionId: number
  pastDue: boolean
  insufficientFunds: boolean
  confirmationUnresolved: boolean
  canceled: boolean
  ended?: boolean
  price: number
  wallet: string | null
  devnet: boolean
  lastRenewal: { date: string; amount: number } | null
}

export function SolanaRenewalDetails({ subscriptionId, pastDue, insufficientFunds, confirmationUnresolved, canceled, ended = false, price, wallet, devnet, lastRenewal }: SolanaRenewalDetailsProps) {
  const t = useTranslations('dashboard.student.billing.subscription.solana')
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const recoveryOnly = confirmationUnresolved || uncertain
  const [message, setMessage] = useState<{ kind: 'insufficient' | 'pending' | 'checked'; text: string } | null>(null)
  async function retry() {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch('/api/payments/solana/retry-renewal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId, recoveryOnly }),
      })
      const result = await response.json()
      if (response.ok && result.status === 'paid') {
        toast.success(t('paid'))
        router.refresh()
      } else if (result.status === 'insufficient_funds') {
        setMessage({ kind: 'insufficient', text: t('insufficient', { amount: result.amount, balance: result.balance }) })
        router.refresh()
      } else if (response.ok && result.status === 'not_due') {
        setMessage({ kind: 'checked', text: t(recoveryOnly ? 'checked' : 'notDue') })
        router.refresh()
      } else {
        setUncertain(true)
        setMessage({ kind: 'pending', text: t('unconfirmed') })
        router.refresh()
      }
    } catch {
      setUncertain(true)
      setMessage({ kind: 'pending', text: t('unconfirmed') })
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{t('paymentMethod')}</span>
        <span>{devnet ? t('devnetMethod') : t('method')}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{t('renewalAmount')}</span>
        <span className="font-medium tabular-nums">{price.toFixed(2)} USDC</span>
      </div>
      {wallet && <p className="break-all text-xs text-muted-foreground">{t('wallet', { wallet })}</p>}
      {canceled ? (
        <Alert>
          <IconCheck />
          <AlertTitle>{t('canceledTitle')}</AlertTitle>
          <AlertDescription>{t(ended ? 'endedHelp' : 'canceledHelp')}</AlertDescription>
        </Alert>
      ) : recoveryOnly ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>{t('pendingTitle')}</AlertTitle>
          <AlertDescription>{t('unconfirmed')}</AlertDescription>
        </Alert>
      ) : pastDue ? (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>{insufficientFunds ? t('insufficientTitle') : t('overdueTitle')}</AlertTitle>
          <AlertDescription>{t(insufficientFunds ? 'topUp' : 'overdueHelp', { amount: price.toFixed(2), network: devnet ? 'Devnet' : 'Solana' })}</AlertDescription>
        </Alert>
      ) : lastRenewal ? (
        <Alert>
          <IconCheck />
          <AlertTitle>{t('lastRenewalPaid', { amount: lastRenewal.amount.toFixed(2) })}</AlertTitle>
          <AlertDescription><BillingDateTime date={lastRenewal.date} /></AlertDescription>
        </Alert>
      ) : null}
      {!canceled && (pastDue || recoveryOnly || message) && (
        <Button variant="outline" onClick={retry} disabled={loading}>
          {loading ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : <IconRefresh data-icon="inline-start" />}
          {loading ? t('retrying') : recoveryOnly ? t('checkPayment') : t('retry')}
        </Button>
      )}
      {message && (!recoveryOnly || message.kind !== 'insufficient') && <p role="status" className="text-sm">{message.text}</p>}
    </div>
  )
}

/** An explicit zone keeps hourly renewal dates unambiguous across SSR/client. */
export function BillingDateTime({ date }: { date: string }) {
  const locale = useLocale()
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return null
  return <time dateTime={date}>{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(parsed)}</time>
}
