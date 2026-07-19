'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { IconLoader2, IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'

interface VerifyPaymentButtonProps {
  transactionId: number
}

/**
 * "Verify now" retry for a stranded pending one-time Solana payment (issue
 * #467). Re-runs the exact on-chain confirmation the checkout page polls —
 * `POST /api/payments/solana/verify` with `{ transactionId }` — so a student
 * who closed the tab before confirmation can settle it without waiting for the
 * reconciler cron. On success the transaction flips to successful (the trigger
 * grants the entitlement) and the page refreshes.
 */
export function VerifyPaymentButton({ transactionId }: VerifyPaymentButtonProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.student.billing.purchases')
  const [loading, setLoading] = useState(false)

  const handleVerify = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/payments/solana/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.confirmed) {
        toast.success(t('verifyConfirmed'))
        router.refresh()
      } else if (res.ok) {
        // Not found on-chain yet — the payment simply hasn't landed.
        toast.info(t('verifyPending'))
      } else {
        toast.error(data.error || t('verifyError'))
      }
    } catch (error) {
      console.error('Failed to verify Solana payment:', error)
      toast.error(t('verifyError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1"
      onClick={handleVerify}
      disabled={loading}
    >
      {loading ? (
        <IconLoader2 className="w-3 h-3 animate-spin" />
      ) : (
        <IconRefresh className="w-3 h-3" />
      )}
      {t('verifyNow')}
    </Button>
  )
}
