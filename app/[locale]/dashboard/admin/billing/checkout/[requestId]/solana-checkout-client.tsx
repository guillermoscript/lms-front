'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { IconCircleCheck, IconCopy, IconLoader2 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SolanaCheckoutClientProps {
  requestId: string
  planName: string
  interval: 'monthly' | 'yearly'
  amountUsd: number
  /** "12.50 USDC" — what actually leaves the wallet, or null if unpriced. */
  settlementLabel: string | null
  /** The `solana:` transaction-request URL rendered as the QR. */
  payUrl: string
  expired: boolean
  billingHref: string
}

/** How often to ask the chain. Matches the student checkout's cadence. */
const POLL_MS = 4000

export function SolanaCheckoutClient({
  requestId,
  planName,
  interval,
  amountUsd,
  settlementLabel,
  payUrl,
  expired,
  billingHref,
}: SolanaCheckoutClientProps) {
  const t = useTranslations('dashboard.admin.billing.cryptoCheckout')
  const router = useRouter()
  const [qr, setQr] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    QRCode.toDataURL(payUrl, { width: 260, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [payUrl])

  useEffect(() => {
    if (expired || confirmed) return

    // Poll until the transfer is on chain. A transient failure is not an
    // answer — only `confirmed` stops the poll, so a flaky RPC or a dropped
    // request never leaves a school staring at a QR it has already paid.
    const tick = async () => {
      try {
        const res = await fetch('/api/billing/solana/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId }),
        })
        const data = await res.json()
        if (data.confirmed) {
          if (pollRef.current) clearInterval(pollRef.current)
          setConfirmed(true)
          toast.success(t('confirmed'))
          router.push(billingHref)
          router.refresh()
        } else if (res.status === 422) {
          // A transaction was found and it did not pay what was owed. Polling
          // on would repeat the same answer forever.
          if (pollRef.current) clearInterval(pollRef.current)
          toast.error(t('mismatch'))
        }
      } catch {
        /* transient — keep polling */
      }
    }

    pollRef.current = setInterval(tick, POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [requestId, expired, confirmed, billingHref, router, t])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payUrl)
      toast.success(t('copied'))
    } catch {
      toast.error(t('copyFailed'))
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {t('subtitle', {
            plan: planName,
            interval: interval === 'yearly' ? t('yearly') : t('monthly'),
          })}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        {expired ? (
          <>
            <p className="text-center text-sm text-muted-foreground">{t('expired')}</p>
            <Button onClick={() => router.push(billingHref)}>{t('backToBilling')}</Button>
          </>
        ) : (
          <>
            <div className="text-center">
              <p className="text-2xl font-semibold">{settlementLabel ?? `$${amountUsd.toFixed(2)}`}</p>
              {settlementLabel && (
                <p className="text-xs text-muted-foreground">
                  {t('usdEquivalent', { amount: amountUsd.toFixed(2) })}
                </p>
              )}
            </div>

            {qr ? (
              // A data: URL generated in the browser — next/image has nothing to
              // optimize here and would only round-trip it through the loader.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={t('qrAlt')} className="size-[260px] rounded-lg border bg-white p-2" />
            ) : (
              <div className="flex size-[260px] items-center justify-center rounded-lg border">
                <IconLoader2 aria-hidden className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}

            <p className="text-center text-sm text-muted-foreground">{t('scan')}</p>

            <Button variant="outline" className="w-full" onClick={copy}>
              <IconCopy aria-hidden className="size-4" />
              {t('copyLink')}
            </Button>

            <p
              aria-live="polite"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              {confirmed ? (
                <>
                  <IconCircleCheck aria-hidden className="size-4 text-primary" />
                  {t('confirmed')}
                </>
              ) : (
                <>
                  <IconLoader2 aria-hidden className="size-4 animate-spin" />
                  {t('waiting')}
                </>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
