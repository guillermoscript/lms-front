'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { IconLoader2 } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

export function CheckoutProcessing() {
  const router = useRouter()
  const t = useTranslations('checkout.success')

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 1500)
    return () => window.clearInterval(interval)
  }, [router])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <IconLoader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
        <h1 className="text-xl font-semibold">{t('confirmingTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('confirmingSubtitle')}
        </p>
      </div>
    </div>
  )
}
