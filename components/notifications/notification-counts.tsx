'use client'

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
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
 *
 * The counts live in a small external store, NOT in the context value. This
 * provider wraps the whole dashboard, page included, and a context value that
 * changes reaches every Suspense boundary under it. On a hard load the first
 * read lands (~50 ms after hydration) while the page's streamed boundary is
 * still waiting for React's batched reveal (up to ~300 ms), and React answers
 * a context change on a boundary it cannot hydrate yet by throwing the server
 * HTML away and rendering the page again on the client. Until the reveal
 * script ran, the DOM then held the page twice — the client copy in <main>
 * and the server copy in its hidden `<div hidden id="S:n">` — on every
 * dashboard page. With `useSyncExternalStore` only the bell and the sidebar
 * badge re-render, and the context value never changes during hydration.
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

/** Holds the counts outside React, so an update re-renders only its readers. */
interface CountsStore {
  get: () => NotificationCounts | null
  set: (next: NotificationCounts | null | ((current: NotificationCounts | null) => NotificationCounts | null)) => void
  subscribe: (listener: () => void) => () => void
}

function createCountsStore(): CountsStore {
  let counts: NotificationCounts | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => counts,
    set: (next) => {
      const value = typeof next === 'function' ? next(counts) : next
      // A poll that finds nothing new must not re-render the readers.
      const same =
        value === counts ||
        (value !== null && counts !== null && value.unread === counts.unread && value.community === counts.community)
      if (same) return
      counts = value
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** The server render — and so the hydrating one — always has no counts yet. */
const getServerCounts = () => null

interface NotificationCountsValue {
  store: CountsStore
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
  store: createCountsStore(),
  userId: null,
  tenantId: null,
  refresh: NOOP,
  markedRead: NOOP,
  markedAllRead: NOOP,
})

export function useNotificationCounts() {
  const { store, ...rest } = use(NotificationCountsContext)
  const counts = useSyncExternalStore(store.subscribe, store.get, getServerCounts)
  return { counts, ...rest }
}

export function NotificationCountsProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const tenant = useTenant()
  const tenantId = tenant?.id ?? null
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  const [store] = useState(createCountsStore)
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
        store.set(await readCounts(supabase, userId, tenantId))
      } while (again.current)
    } finally {
      inFlight.current = false
    }
  }, [store, supabase, userId, tenantId])

  // First read, again whenever the user or the school changes (a new `load`),
  // and on navigation — throttled there, since a user clicking through lessons
  // would otherwise read on every page. One effect, not two: both would run on
  // mount and every page load would read everything twice.
  const readFor = useRef<typeof load | null>(null)
  useEffect(() => {
    const fresh = readFor.current !== load
    if (!fresh && Date.now() - lastRead.current < NAVIGATION_THROTTLE_MS) return
    readFor.current = load
    void load()
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

  const markedRead = useCallback(
    (notificationType: string | null) => {
      store.set((current) =>
        current
          ? {
              unread: Math.max(0, current.unread - 1),
              community:
                notificationType === COMMUNITY_NOTIFICATION_TYPE ? Math.max(0, current.community - 1) : current.community,
            }
          : current
      )
    },
    [store]
  )

  const markedAllRead = useCallback(() => {
    store.set((current) => (current ? { unread: 0, community: 0 } : current))
  }, [store])

  // Stable for the life of the page (user and school do not change during a
  // load): counts reach their readers through the store, never through here.
  const value = useMemo(
    () => ({ store, userId, tenantId, refresh, markedRead, markedAllRead }),
    [store, userId, tenantId, refresh, markedRead, markedAllRead]
  )

  return <NotificationCountsContext.Provider value={value}>{children}</NotificationCountsContext.Provider>
}
