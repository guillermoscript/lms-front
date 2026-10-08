'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  IconBrandFacebook,
  IconBrandLinkedin,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconBrandX,
  IconCheck,
  IconLink,
  IconMail,
  IconShare3,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ShareButtonProps {
  /** Path on this school's own domain, e.g. `/courses/12`. Resolved against `window.location.origin` on click. */
  path: string
  /** Title shown in the post / email subject. */
  title: string
  /** Icon-only trigger (rows, dense headers). */
  iconOnly?: boolean
  size?: 'sm' | 'icon-sm'
  className?: string
}

/** Share targets are plain intent URLs: no SDKs, no trackers, no keys. */
const TARGETS = [
  { key: 'whatsapp', Icon: IconBrandWhatsapp, href: (u: string, x: string, both: string) => `https://wa.me/?text=${both}` },
  { key: 'x', Icon: IconBrandX, href: (u: string, x: string) => `https://twitter.com/intent/tweet?text=${x}&url=${u}` },
  { key: 'facebook', Icon: IconBrandFacebook, href: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  { key: 'linkedin', Icon: IconBrandLinkedin, href: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  { key: 'telegram', Icon: IconBrandTelegram, href: (u: string, x: string) => `https://t.me/share/url?url=${u}&text=${x}` },
  { key: 'email', Icon: IconMail, href: (u: string, x: string, both: string) => `mailto:?subject=${x}&body=${both}` },
] as const

export function ShareButton({ path, title, iconOnly = false, size = 'sm', className }: ShareButtonProps) {
  const t = useTranslations('dashboard.teacher.share')
  const [copied, setCopied] = useState(false)

  const absoluteUrl = () => new URL(path, window.location.origin).toString()

  async function copy() {
    try {
      await navigator.clipboard.writeText(absoluteUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard is undefined on plain http; the social targets still work
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url: absoluteUrl() })
    } catch {
      // user dismissed the sheet
    }
  }

  function open(href: string) {
    window.open(href, href.startsWith('mailto:') ? '_self' : '_blank', 'noopener,noreferrer')
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size={iconOnly ? 'icon-sm' : size} className={className} />}
        aria-label={t('shareTitle', { title })}
      >
        <IconShare3 className="h-3.5 w-3.5" />
        {!iconOnly && t('share')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          {TARGETS.map(({ key, Icon, href }) => (
            <DropdownMenuItem
              key={key}
              onClick={() => {
                const url = absoluteUrl()
                open(href(encodeURIComponent(url), encodeURIComponent(title), encodeURIComponent(`${title} ${url}`)))
              }}
            >
              <Icon /> {t(key)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {canNativeShare && (
            <DropdownMenuItem onClick={nativeShare}>
              <IconShare3 /> {t('more')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem closeOnClick={false} onClick={copy}>
            {copied ? <IconCheck /> : <IconLink />} {copied ? t('copied') : t('copyLink')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
