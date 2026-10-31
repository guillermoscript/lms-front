'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getSafeNextPath } from '@/lib/auth/safe-next-path'

/**
 * "Save your score and join <school>": Google, or email/password via the
 * existing sign-up / login pages with `next=/reto/<token>?claim=1`.
 *
 * "Continuar con Google" shown under a guest's challenge result. Starts the
 * same OAuth flow as `login-form.tsx`; the callback sends a non-member through
 * `/join-school` and then back to `/reto/<token>?claim=1`, where
 * `ClaimResult` runs the claim.
 */
export function ClaimCta({ token, schoolName }: { token: string; schoolName?: string | null }) {
  const t = useTranslations('challenges.claim')
  const tg = useTranslations('challenges.guest')
  // Email/password reuse the existing auth pages; both come back to the same
  // claim URL, so the guest cookie claim is untouched (see claimChallenge).
  const returnTo = encodeURIComponent(getSafeNextPath(`/reto/${encodeURIComponent(token)}?claim=1`, '/'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setLoading(true)
    setError(null)
    try {
      const next = getSafeNextPath(`/reto/${encodeURIComponent(token)}?claim=1`, '/')
      const supabase = createClient()
      await supabase.auth.signOut({ scope: 'local' })
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
        },
      })
      if (error) throw error
    } catch {
      setError(t('error'))
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-semibold">
        {schoolName?.trim() ? tg('ctaTitle', { school: schoolName.trim() }) : tg('ctaTitleNoSchool')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('ctaHint')}</p>
      <Button type="button" onClick={start} disabled={loading} className="w-full">
        {loading ? t('loading') : t('cta')}
      </Button>
      <Button variant="outline" className="w-full" render={<Link href={`/auth/sign-up?next=${returnTo}`} />}>
        {tg('emailCta')}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {tg('haveAccount')}{' '}
        <Link href={`/auth/login?next=${returnTo}`} className="font-medium text-foreground underline underline-offset-4">
          {tg('loginCta')}
        </Link>
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
