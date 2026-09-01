'use client'

/**
 * Keeps Sentry's user identity in lock-step with the Supabase session.
 *
 * WHY: the Sentry ↔ OpenPanel cross-link (`docs/ANALYTICS_OPENPANEL.md` §12)
 * joins the two systems on the Supabase auth user id — OpenPanel stores it as
 * `profileId`, Sentry as `user.id`. OpenPanel's tracker persists its profile
 * binding in its own storage, but `Sentry.setUser()` lives only in JS memory,
 * so binding it once at login evaporates on the first hard navigation and
 * every error after that is anonymous on the Sentry side. This component is
 * mounted in the root layout, so the binding survives reloads and follows
 * sign-in/sign-out for the whole tab lifetime.
 *
 * `getSession()` reads the JWT from cookies — no network call — per the auth
 * performance rules. Id only: no email, no name, ever.
 */

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'

export function SentryUserBinder() {
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const bind = (userId: string | null | undefined) => {
      if (cancelled) return
      Sentry.setUser(userId ? { id: userId } : null)
    }

    supabase.auth
      .getSession()
      .then(({ data }) => bind(data.session?.user?.id))
      .catch(() => {
        // An unreadable session must never surface as a page error.
      })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => bind(session?.user?.id)
    )

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  return null
}
