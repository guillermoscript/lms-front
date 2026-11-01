'use client'

import { useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { IconBrandWhatsapp, IconCheck, IconCopy, IconShare3 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const noopSubscribe = () => () => {}

/** Invite link: copy, Web Share where available, WhatsApp with the message prefilled. */
export function InviteShare({ token, groupName }: { token: string; groupName: string }) {
  const t = useTranslations('challenges.groups.invite')
  const [copied, setCopied] = useState(false)
  // Read after mount: `window` differs between server and client render.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '')
  const canShare = useSyncExternalStore(noopSubscribe, () => typeof navigator.share === 'function', () => false)
  const url = origin ? `${origin}/grupo/${encodeURIComponent(token)}` : ''
  const text = t('whatsappText', { group: groupName, url })

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success(t('copied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('copyFailed'))
    }
  }

  async function share() {
    try {
      await navigator.share({ title: groupName, text, url })
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') await copy()
    }
  }

  return (
    <div className="space-y-3" data-testid="group-invite">
      <div className="space-y-2">
        <Label htmlFor="group-invite-link">{t('linkLabel')}</Label>
        <Input id="group-invite-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} data-testid="group-invite-link" />
      </div>
      <p className="text-sm text-muted-foreground">{t('hint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy} disabled={!url}>
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? t('copied') : t('copy')}
        </Button>
        {canShare && (
          <Button type="button" variant="outline" onClick={share} disabled={!url}>
            <IconShare3 />
            {t('share')}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={!url}
          render={<a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" />}
        >
          <IconBrandWhatsapp />
          {t('whatsapp')}
        </Button>
      </div>
    </div>
  )
}
