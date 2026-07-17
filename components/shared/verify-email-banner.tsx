'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconMailExclamation, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface VerifyEmailBannerProps {
  email: string
}

export function VerifyEmailBanner({ email }: VerifyEmailBannerProps) {
  const t = useTranslations('components.verifyEmailBanner')
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)

  if (dismissed) return null

  const handleResend = async () => {
    setSending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
      },
    })
    setSending(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(t('resendSuccess'))
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-yellow-500/50 bg-yellow-50 px-4 py-2.5 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-200">
      <IconMailExclamation className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-sm">
        {t('message', { email })}{' '}
        <span className="text-xs opacity-80">{t('gatedNote')}</span>
      </p>
      <Button variant="outline" size="sm" onClick={handleResend} disabled={sending}>
        {sending ? t('resending') : t('resend')}
      </Button>
      <button
        onClick={() => setDismissed(true)}
        aria-label={t('dismiss')}
        className="text-muted-foreground hover:text-foreground"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  )
}
