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
  /** A plan purchase (#610) or a platform-fee payment (#950). */
  kind: 'plan' | 'fee'
  requestId: string
  planName: string
  interval: 'monthly' | 'yearly'
  amountUsd: number
  /** "12.50 USDC" — what actually leaves the wallet, or null if unpriced. */
  settlementLabel: string | null
  /** The `solana:` transaction-request URL rendered as the QR. */
  payUrl: string
  expired: boolean
  /** Where a settled or lapsed payment sends the school: Billing or Earnings. */
  returnHref: string
}

/** How often to ask the chain. Matches the student checkout's cadence. */
const POLL_MS = 4000

export function SolanaCheckoutClient({
  kind,
  requestId,
  planName,
  interval,
  amountUsd,
  settlementLabel,
  payUrl,
  expired,
  returnHref,
}: SolanaCheckoutClientProps) {
  const t = useTranslations('dashboard.admin.billing.cryptoCheckout')
  const router = useRouter()
  const [qr, setQr] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFee = kind === 'fee'
  const confirmedLabel = isFee ? t('feeConfirmed') : t('confirmed')

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
          toast.success(confirmedLabel)
          router.push(returnHref)
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
  }, [requestId, expired, confirmed, returnHref, router, t, confirmedLabel])

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
          {isFee
            ? t('feeSubtitle')
            : t('subtitle', {
                plan: planName,
                interval: interval === 'yearly' ? t('yearly') : t('monthly'),
              })}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        {expired ? (
          <>
            <p className="text-center text-sm text-muted-foreground">
              {isFee ? t('feeExpired') : t('expired')}
            </p>
            <Button onClick={() => router.push(returnHref)}>
              {isFee ? t('backToEarnings') : t('backToBilling')}
            </Button>
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
              // The QR keeps an explicit white plate + quiet zone on every theme —
              // its modules are black and inverted or tinted quiet zones fail on a
              // meaningful share of phone scanners. Content colour, not chrome: do
              // not tokenise it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={t('qrAlt')} className="size-[260px] rounded-lg border bg-white p-2" />
            ) : (
              <div className="flex size-[260px] items-center justify-center rounded-lg border">
                <IconLoader2 aria-hidden className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}

            <p className="text-center text-sm text-muted-foreground">
              {isFee ? t('feeScan') : t('scan')}
            </p>

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
                  <IconCircleCheck aria-hidden className="size-4 text-success" />
                  {confirmedLabel}
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
