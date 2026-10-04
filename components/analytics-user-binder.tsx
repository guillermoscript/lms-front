'use client'

/**
 * Keeps BOTH telemetry identities in lock-step with the Supabase session:
 *
 *   - OpenPanel: `identify({ profileId, firstName, lastName, email, … })` so
 *     every session in the dashboard is listed under the person, not a device
 *     id. The login/sign-up forms identify at the moment of the click; this
 *     component is what makes the binding hold on every later page load,
 *     after a token refresh, and after a sign-out on a shared machine
 *     (`reset()` so the next visitor is not attributed to the previous one).
 *   - Sentry: `setUser({ id })`. The Sentry ↔ OpenPanel cross-link
 *     (`docs/ANALYTICS_OPENPANEL.md` §12) joins on the auth user id, and
 *     `Sentry.setUser()` lives only in JS memory, so it must be re-applied on
 *     every hard navigation. Sentry gets the id only.
 *
 * Mounted once in the root layout. `getSession()` reads the JWT from cookies,
 * no network call, per the auth performance rules. Identify is de-duplicated
 * per user id so `TOKEN_REFRESHED` does not re-send the profile every hour.
 */

import { useEffect, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useAnalytics } from '@/lib/analytics/client'
import { rolesFromAccessToken, traitsFromSessionUser } from '@/lib/analytics/identity'

export function AnalyticsUserBinder() {
  const analytics = useAnalytics()
  const boundUserId = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const bind = (session: Session | null | undefined) => {
      if (cancelled) return
      const user = session?.user
      const userId = user?.id ?? null

      Sentry.setUser(userId ? { id: userId } : null)

      if (userId === boundUserId.current) return
      const previous = boundUserId.current
      boundUserId.current = userId

      if (!userId || !user) {
        // A real sign-out (not a first render with no session).
        if (previous) analytics.reset()
        return
      }

      analytics.identify(
        userId,
        rolesFromAccessToken(session?.access_token),
        traitsFromSessionUser(user)
      )
    }

    supabase.auth
      .getSession()
      .then(({ data }) => bind(data.session))
      .catch(() => {
        // An unreadable session must never surface as a page error.
      })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => bind(session)
    )

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [analytics])

  return null
}
