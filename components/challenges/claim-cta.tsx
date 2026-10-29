'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getSafeNextPath } from '@/lib/auth/safe-next-path'

/**
 * "Continuar con Google" shown under a guest's challenge result. Starts the
 * same OAuth flow as `login-form.tsx`; the callback sends a non-member through
 * `/join-school` and then back to `/reto/<token>?claim=1`, where
 * `ClaimResult` runs the claim.
 */
export function ClaimCta({ token }: { token: string }) {
  const t = useTranslations('challenges.claim')
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
      <p className="text-sm text-muted-foreground">{t('ctaHint')}</p>
      <Button type="button" onClick={start} disabled={loading} className="w-full">
        {loading ? t('loading') : t('cta')}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
