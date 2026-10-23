'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconBrandWhatsapp, IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

/** Join link with copy + WhatsApp, and a way to look at the public site. */
export function ShareSchool({
  joinUrl,
  siteUrl,
  whatsappText,
}: {
  joinUrl: string
  siteUrl: string
  whatsappText: string
}) {
  const t = useTranslations('dashboard.admin.main.share')
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    let ok = false
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(joinUrl)
        ok = true
      } catch {
        // Plain-http dev origins expose the API but reject writes.
      }
    }
    if (!ok) {
      const ta = document.createElement('textarea')
      ta.value = joinUrl
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section aria-labelledby="share-title" data-testid="admin-share-school" className="space-y-2 rounded-lg border p-3">
      <h2 id="share-title" className="text-sm font-semibold">
        {t('title')}
      </h2>
      <p className="text-xs text-muted-foreground">{t('description')}</p>
      <p className="break-all rounded-md bg-muted/50 px-2 py-1.5 text-xs">{joinUrl}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy} className="gap-1.5">
          {copied ? <IconCheck aria-hidden /> : <IconCopy aria-hidden />}
          <span aria-live="polite">{copied ? t('copied') : t('copy')}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() =>
            window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, '_blank', 'noopener')
          }
        >
          <IconBrandWhatsapp aria-hidden />
          {t('whatsapp')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5"
          render={<Link href={siteUrl} target="_blank" rel="noopener" />}
        >
          <IconExternalLink aria-hidden />
          {t('viewSite')}
        </Button>
      </div>
    </section>
  )
}
