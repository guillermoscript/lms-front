'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconCheck, IconCopy, IconShare3 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** Web Share where the browser has it (phones), clipboard otherwise. */
export function ChallengeShareButton({ title, text }: { title: string; text: string }) {
  const t = useTranslations('challenges.page')
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success(t('linkCopied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('copyFailed'))
    }
  }

  async function onClick() {
    const url = window.location.href
    if (canShare) {
      try {
        await navigator.share({ title, text, url })
        return
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
      }
    }
    await copy(url)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onClick} data-testid="challenge-share">
        {canShare ? <IconShare3 /> : copied ? <IconCheck /> : <IconCopy />}
        {canShare ? t('share') : copied ? t('linkCopied') : t('copyLink')}
      </Button>
      {canShare ? (
        <Button variant="outline" onClick={() => copy(window.location.href)}>
          {copied ? <IconCheck /> : <IconCopy />}
          {t('copyLink')}
        </Button>
      ) : null}
    </div>
  )
}
