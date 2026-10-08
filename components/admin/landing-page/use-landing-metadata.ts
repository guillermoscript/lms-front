'use client'

/**
 * The editor's Puck `metadata`, kept in sync with the ids the page binds.
 *
 * The server hands the editor `landingData` for the ids the pages referenced
 * at load time. When a human picks a course in a field, or the AI binds one,
 * the new id is not in that bundle yet — this hook notices it (via Puck's
 * `onChange`), fetches the missing course / details / product through the
 * admin-only `getLandingCourseDetails` action, and merges the result in.
 *
 * Wiring (puck-editor.tsx, owned by the editor WP):
 *
 *   const { metadata, onDataChange } = useLandingMetadata(landingData, { isAiTurnActive })
 *   <LandingPickerProviders metadata={metadata}>
 *     <Puck metadata={metadata} onChange={onDataChange} … />
 *   </LandingPickerProviders>
 *
 * Merges are DEFERRED while `isAiTurnActive` is true (critique A4): a new
 * `metadata` identity regenerates Puck's app store mid-turn. Fetches still run;
 * their results land in one merge when the turn ends. The returned `metadata`
 * keeps its identity between merges (it is state, not a fresh object per render).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Data } from '@measured/puck'
import { getLandingCourseDetails, type LandingBindingData } from '@/app/actions/admin/landing-course-details'
import { collectBoundIds, missingIds } from '@/lib/puck/utils/collect-bound-ids'
import type { LandingData, PuckMetadata } from '@/lib/puck/types'

type Fetcher = (input: {
  courseIds: string[]
  detailCourseIds: string[]
  productIds: string[]
}) => Promise<{ success: true; data?: LandingBindingData } | { success: false; error: string }>

export interface UseLandingMetadataOptions {
  /** True while an AI turn is streaming ops into the editor. */
  isAiTurnActive?: boolean
  /** Debounce before fetching newly bound ids (ms). */
  debounceMs?: number
  /** Test seam; defaults to the server action. */
  fetcher?: Fetcher
}

function unionById<T extends { id: string }>(first: T[] | undefined, second: T[] | undefined): T[] {
  const out = [...(first ?? [])]
  const seen = new Set(out.map((x) => x.id))
  for (const x of second ?? []) {
    if (seen.has(x.id)) continue
    seen.add(x.id)
    out.push(x)
  }
  return out
}

/** Pure merge of a fetched binding bundle into the metadata. */
export function mergeLandingMetadata(prev: PuckMetadata, data: LandingBindingData): PuckMetadata {
  return {
    ...prev,
    // The picker lists are published-only; drafts live in courseDetails, flagged.
    courses: unionById(prev.courses, data.courses.filter((c) => c.status !== 'draft')),
    products: unionById(prev.products, data.products),
    courseDetails: { ...(prev.courseDetails ?? {}), ...data.courseDetails },
  }
}

/**
 * A new server bundle (router.refresh() after a theme Apply, a save…) over the metadata the
 * editor already has. The server builds it from the SAVED pages only, so ids fetched for
 * unsaved bindings since then are carried over; the new bundle wins where both have a value.
 */
export function carryOverMetadata(next: PuckMetadata, prev: PuckMetadata): PuckMetadata {
  return {
    ...next,
    courses: unionById(next.courses, prev.courses),
    products: unionById(next.products, prev.products),
    courseDetails: { ...(prev.courseDetails ?? {}), ...(next.courseDetails ?? {}) },
  }
}

/** Ids the page binds that the metadata does not cover yet. */
export function idsToFetch(metadata: PuckMetadata, data: unknown) {
  const bound = collectBoundIds(data)
  const details = Object.keys(metadata.courseDetails ?? {})
  const courses = [...(metadata.courses ?? []).map((c) => c.id), ...details]
  return {
    courseIds: missingIds(bound.courseIds, courses),
    detailCourseIds: missingIds(bound.detailCourseIds, details),
    productIds: missingIds(bound.productIds, (metadata.products ?? []).map((p) => p.id)),
  }
}

export function useLandingMetadata(initial: LandingData | PuckMetadata, opts: UseLandingMetadataOptions = {}) {
  // NOTE: call `onDataChange(initialPageData)` once on mount: the server bundle is built for
  // every page of the school and capped, so the page being opened may bind ids it lacks.
  const { isAiTurnActive = false, debounceMs = 250 } = opts
  const fetcher: Fetcher = opts.fetcher ?? getLandingCourseDetails

  const [metadata, setMetadata] = useState<PuckMetadata>(() => ({ ...initial }))
  const metaRef = useRef(metadata)
  const activeRef = useRef(isAiTurnActive)
  const fetcherRef = useRef(fetcher)
  // Mirror the latest values for the async callbacks (refs are written in effects, not render).
  useEffect(() => {
    metaRef.current = metadata
    activeRef.current = isAiTurnActive
    fetcherRef.current = fetcher
  })

  const pendingRef = useRef<LandingBindingData[]>([])
  /** A new server bundle that arrived during an AI turn (applied when it ends). */
  const pendingInitialRef = useRef<PuckMetadata | null>(null)
  const requestedRef = useRef(new Set<string>())
  const queueRef = useRef({ courseIds: new Set<string>(), detailCourseIds: new Set<string>(), productIds: new Set<string>() })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (activeRef.current) return
    const next = pendingInitialRef.current
    if (!next && pendingRef.current.length === 0) return
    pendingInitialRef.current = null
    const batch = pendingRef.current
    pendingRef.current = []
    setMetadata((prev) => batch.reduce(mergeLandingMetadata, next ? carryOverMetadata(next, prev) : prev))
  }, [])

  // A new server bundle (e.g. after router.refresh()) is merged OVER what the editor has, so
  // details fetched for unsaved bindings survive (their keys stay in requestedRef and would
  // never be fetched again). Deferred like any merge while an AI turn runs.
  const initialRef = useRef(initial)
  useEffect(() => {
    if (initialRef.current === initial) return
    initialRef.current = initial
    pendingInitialRef.current = { ...initial }
    flush()
  }, [initial, flush])

  // Turn ended → apply everything fetched during it in one merge.
  useEffect(() => {
    if (!isAiTurnActive) flush()
  }, [isAiTurnActive, flush])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const runFetch = useCallback(async () => {
    timerRef.current = null
    const q = queueRef.current
    const input = {
      courseIds: [...q.courseIds],
      detailCourseIds: [...q.detailCourseIds],
      productIds: [...q.productIds],
    }
    queueRef.current = { courseIds: new Set(), detailCourseIds: new Set(), productIds: new Set() }
    if (!input.courseIds.length && !input.detailCourseIds.length && !input.productIds.length) return

    const keys = [
      ...input.courseIds.map((id) => `c:${id}`),
      ...input.detailCourseIds.map((id) => `d:${id}`),
      ...input.productIds.map((id) => `p:${id}`),
    ]
    try {
      const result = await fetcherRef.current(input)
      if (!result.success || !result.data) throw new Error(result.success ? 'empty' : result.error)
      pendingRef.current.push(result.data)
      flush()
    } catch {
      // Let a later change retry these ids.
      for (const key of keys) requestedRef.current.delete(key)
    }
  }, [flush])

  /** Pass to `<Puck onChange>`; cheap enough to run on every change. */
  const onDataChange = useCallback(
    (data: Data) => {
      const need = idsToFetch(metaRef.current, data)
      let queued = false
      const enqueue = (prefix: string, ids: string[], into: Set<string>) => {
        for (const id of ids) {
          const key = `${prefix}:${id}`
          if (requestedRef.current.has(key)) continue
          requestedRef.current.add(key)
          into.add(id)
          queued = true
        }
      }
      enqueue('c', need.courseIds, queueRef.current.courseIds)
      enqueue('d', need.detailCourseIds, queueRef.current.detailCourseIds)
      enqueue('p', need.productIds, queueRef.current.productIds)
      if (!queued || timerRef.current) return
      timerRef.current = setTimeout(() => void runFetch(), debounceMs)
    },
    [debounceMs, runFetch]
  )

  return { metadata, onDataChange }
}
