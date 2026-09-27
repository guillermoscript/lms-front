'use client'

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/components/tenant/tenant-provider'
import { COMMUNITY_NOTIFICATION_TYPE, deriveUnreadCounts } from '@/lib/community/notifications'

/**
 * Unread notification counts for the bell and the sidebar Community badge
 * (issue #870), shared so one poll feeds both.
 *
 * Read with the BROWSER client, straight from PostgREST under RLS: a server
 * action would be a POST through `proxy.ts`, which calls GoTrue's getUser() on
 * every request, while PostgREST verifies the JWT locally. The explicit tenant
 * filter matters: the session cookie is shared across school subdomains, so if
 * the JWT's school and the page's school ever disagree (two tabs), the RLS
 * recipient policy and this filter together can only under-count — never show
 * another school's notifications.
 *
 * Counts are null while loading and after an error, and consumers render no
 * badge then: a failed read is not "0 unread".
 */

/** Unread rows read per poll, per figure; a badge shows `99+` past 99. */
const COUNT_LIMIT = 100
const POLL_MS = 60_000
/** Navigating refreshes, at most once per this window. */
const NAVIGATION_THROTTLE_MS = 10_000

export interface NotificationCounts {
  unread: number
  community: number
}

interface NotificationCountsValue {
  counts: NotificationCounts | null
  userId: string | null
  tenantId: string | null
  /** Re-read now (after marking something read, dismissing, …). */
  refresh: () => void
  /** Drop one unread row from the counts until the next read lands. */
  markedRead: (notificationType: string | null) => void
  /** Everything in this school was marked read. */
  markedAllRead: () => void
}

const NOOP = () => {}

/**
 * This school's unread rows for the user, counted; null when a read fails. The
 * community figure has its own read: inside the all-types page it would miss
 * community rows pushed out by 100 newer unread ones of other types.
 */
async function readCounts(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tenantId: string
): Promise<NotificationCounts | null> {
  try {
    const [all, community] = await Promise.all([
      supabase
        .from('user_notifications')
        .select('id, notification:notifications!inner(notification_type, tenant_id)')
        .eq('user_id', userId)
        .eq('in_app_read', false)
        .not('dismissed', 'is', true)
        .eq('notification.tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(COUNT_LIMIT),
      supabase
        .from('user_notifications')
        .select('id, notification:notifications!inner(notification_type, tenant_id)')
        .eq('user_id', userId)
        .eq('in_app_read', false)
        .not('dismissed', 'is', true)
        .eq('notification.tenant_id', tenantId)
        .eq('notification.notification_type', COMMUNITY_NOTIFICATION_TYPE)
        .limit(COUNT_LIMIT),
    ])
    return all.error || community.error ? null : deriveUnreadCounts(all.data, community.data)
  } catch {
    return null
  }
}

const NotificationCountsContext = createContext<NotificationCountsValue>({
  counts: null,
  userId: null,
  tenantId: null,
  refresh: NOOP,
  markedRead: NOOP,
  markedAllRead: NOOP,
})

export function useNotificationCounts() {
  return use(NotificationCountsContext)
}

export function NotificationCountsProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const tenant = useTenant()
  const tenantId = tenant?.id ?? null
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  const [counts, setCounts] = useState<NotificationCounts | null>(null)
  const inFlight = useRef(false)
  const again = useRef(false)
  const lastRead = useRef(0)

  const load = useCallback(async () => {
    // No user or no school (platform pages): nothing to count, no poll.
    if (!userId || !tenantId) return
    // A read already running: have it go round once more when it lands, so a
    // refresh() right after marking something read is never lost.
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    try {
      do {
        again.current = false
        lastRead.current = Date.now()
        setCounts(await readCounts(supabase, userId, tenantId))
      } while (again.current)
    } finally {
      inFlight.current = false
    }
  }, [supabase, userId, tenantId])

  // First read, and again whenever the user or the school changes. The empty
  // `then` moves the state update into an async continuation
  // (react-hooks/set-state-in-effect), as plan-change-dialog does.
  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  // Navigating is a good moment to catch up — throttled, since a user clicking
  // through lessons would otherwise read on every page.
  useEffect(() => {
    if (Date.now() - lastRead.current < NAVIGATION_THROTTLE_MS) return
    void Promise.resolve().then(load)
  }, [pathname, load])

  // Coming back to the tab, and a slow poll while it is visible.
  useEffect(() => {
    if (!userId || !tenantId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(onVisible, POLL_MS)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [load, userId, tenantId])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  const markedRead = useCallback((notificationType: string | null) => {
    setCounts((current) =>
      current
        ? {
            unread: Math.max(0, current.unread - 1),
            community:
              notificationType === COMMUNITY_NOTIFICATION_TYPE ? Math.max(0, current.community - 1) : current.community,
          }
        : current
    )
  }, [])

  const markedAllRead = useCallback(() => {
    setCounts((current) => (current ? { unread: 0, community: 0 } : current))
  }, [])

  const value = useMemo(
    () => ({ counts, userId, tenantId, refresh, markedRead, markedAllRead }),
    [counts, userId, tenantId, refresh, markedRead, markedAllRead]
  )

  return <NotificationCountsContext.Provider value={value}>{children}</NotificationCountsContext.Provider>
}
