'use client'

/**
 * Client-side product analytics — the ONLY module in the app that talks to
 * OpenPanel from the browser (`docs/ANALYTICS_OPENPANEL.md` §2.4).
 *
 * Same three guarantees as the server wrapper: never throws, never emits
 * without credentials, and applies the identical `shouldDropEvent()` predicate
 * so the two transports cannot drift.
 *
 * Safe to call when the provider is absent. `<OpenPanelComponent>` only renders
 * when `NEXT_PUBLIC_OPENPANEL_CLIENT_ID` is set, so in dev `window.op` does not
 * exist — the vendor's own optional chaining plus the guards below make every
 * call a silent no-op rather than a crash.
 *
 * REMEMBER THE DIVISION OF LABOUR (§2.3): the browser tracks *intent and UI
 * interaction*. Anything involving money, entitlement or account lifecycle
 * fires from the server, because adblockers eat 10–30% of browser events and
 * you cannot run a business on that.
 */

import { useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { useOpenPanel } from '@openpanel/nextjs'
import {
  type AnalyticsEventName,
  type AnalyticsProperties,
  type PropertiesFor,
} from './events'
import { type AnalyticsExclusionContext, shouldDropEvent } from './exclusions'

export type ClientAnalyticsOptions = Omit<AnalyticsExclusionContext, 'path'>

export type ClientAnalytics = {
  /** Record a product event. Never throws, never rejects. */
  track: <E extends AnalyticsEventName>(
    name: E,
    props?: PropertiesFor<E>
  ) => void
  /** Attach non-PII traits to the current profile. Never send email or name. */
  identify: (userId: string, properties?: AnalyticsProperties) => void
  /** Manual screen view. Routine navigation is already covered by `trackScreenViews`. */
  screenView: (path?: string, properties?: AnalyticsProperties) => void
}

/**
 * @param options `isSuperAdmin` / `isImpersonating` are passed down from a
 * server component that already resolved them — this hook must never add a
 * round trip of its own to decide whether to drop an event.
 */
export function useAnalytics(options: ClientAnalyticsOptions = {}): ClientAnalytics {
  const op = useOpenPanel()
  const pathname = usePathname()
  const { isSuperAdmin, isImpersonating } = options

  const dropped = useMemo(
    () => shouldDropEvent({ path: pathname, isSuperAdmin, isImpersonating }),
    [pathname, isSuperAdmin, isImpersonating]
  )

  const track = useCallback<ClientAnalytics['track']>(
    (name, props) => {
      if (dropped || typeof window === 'undefined') return
      try {
        op.track(name, (props ?? {}) as AnalyticsProperties)
      } catch {
        // A missing provider, a blocked script, a serialisation failure — none
        // of them are worth breaking a click handler over.
      }
    },
    [dropped, op]
  )

  const identify = useCallback<ClientAnalytics['identify']>(
    (userId, properties) => {
      if (dropped || !userId || typeof window === 'undefined') return
      try {
        op.identify({ profileId: userId, properties })
      } catch {
        // Ignored by design — see `track`.
      }
    },
    [dropped, op]
  )

  const screenView = useCallback<ClientAnalytics['screenView']>(
    (path, properties) => {
      if (dropped || typeof window === 'undefined') return
      try {
        if (path) op.screenView(path, properties)
        else op.screenView(properties)
      } catch {
        // Ignored by design — see `track`.
      }
    },
    [dropped, op]
  )

  return useMemo(
    () => ({ track, identify, screenView }),
    [track, identify, screenView]
  )
}
