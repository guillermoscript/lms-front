'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconMicrophone } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { getSafeNextPath } from '@/lib/auth/safe-next-path'

/**
 * What a guest sees on a VOICE reto: playing needs a live call billed to the
 * school's AI key, so it is for signed-in members. Sign-up/login come back to
 * this page, where a member then gets the player (the dashboard route).
 */
export function ChallengeVoiceGate({ token, schoolName }: { token: string; schoolName?: string | null }) {
  const t = useTranslations('challenges.page')
  const returnTo = encodeURIComponent(getSafeNextPath(`/reto/${encodeURIComponent(token)}`, '/'))
  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/50 p-5" data-testid="challenge-voice-gate">
      <div className="flex items-center gap-2">
        <IconMicrophone size={18} aria-hidden="true" />
        <h2 className="text-base font-semibold">{t('voiceGateTitle')}</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        {schoolName?.trim() ? t('voiceGateBodySchool', { school: schoolName.trim() }) : t('voiceGateBody')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button render={<Link href={`/auth/sign-up?next=${returnTo}`} />}>{t('voiceGateSignUp')}</Button>
        <Link href={`/auth/login?next=${returnTo}`} className="text-sm font-medium underline underline-offset-4">
          {t('voiceGateLogin')}
        </Link>
      </div>
    </section>
  )
}
