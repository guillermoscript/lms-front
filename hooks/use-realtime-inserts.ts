'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// supabase-js hands back the EXISTING channel for a topic it already has, so
// two mounts of the same feed (React Strict Mode, two open threads on one post)
// would share — and the first unmount would tear down the second's. Every
// mount gets its own topic.
let mountSeq = 0

/**
 * Subscribe to Postgres Changes INSERTs on one table, narrowed by `filter`
 * (e.g. `post_id=eq.<uuid>`), for as long as the component is mounted and
 * `filter` is non-null. One channel per mount; it is removed on unmount or
 * when the filter changes, so navigating between feeds leaves none behind.
 *
 * Delivery respects the viewer's RLS (their session JWT). `onInsert` gets the
 * raw row: treat it as a signal and re-read through the server, never render
 * it. `onSubscribed` fires on every (re)join — the first right after mount, the
 * rest after a dropped socket came back — so the caller can catch up on
 * anything it missed while offline.
 */
export function useRealtimeInserts({
  table,
  filter,
  onInsert,
  onSubscribed,
}: {
  table: string
  filter: string | null
  onInsert: (row: Record<string, unknown>) => void
  onSubscribed?: (first: boolean) => void
}) {
  const onInsertRef = useRef(onInsert)
  const onSubscribedRef = useRef(onSubscribed)
  useEffect(() => {
    onInsertRef.current = onInsert
    onSubscribedRef.current = onSubscribed
  })

  useEffect(() => {
    if (!filter) return
    const supabase = createClient()
    let joins = 0
    const channel = supabase
      .channel(`${table}:${filter}:${++mountSeq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, (payload) => {
        onInsertRef.current(payload.new as Record<string, unknown>)
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        joins += 1
        onSubscribedRef.current?.(joins === 1)
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, filter])
}
