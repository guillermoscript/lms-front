'use client'

/**
 * The Page Architect chat, wired into the live Puck editor (design §3.6).
 *
 * Must render INSIDE `<Puck>` (the panel is mounted through `overrides.puck`): it reads the
 * latest editor state with `useGetPuck` at send time and applies streamed `data-page-op` parts
 * through a `PageArchitectTurn` (one undo step per turn).
 *
 * Request body (server contract, `/api/landing/chat`):
 *   { chatId, messages, pageId, pageData, selectedId?, locale }
 * `chatId = pageId`, so `useChat` keeps the conversation while the editor stays mounted
 * (history is not persisted across reloads in v1, critique I).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai'
import { useGetPuck } from '@measured/puck'
import type { PageBuilderDataParts, ThemePreview } from '@lms/core'
import { isKitThemeId } from '@/lib/themes/kit'
import type { GetPuck } from './apply-op-to-puck'
import { usePageArchitectContext } from './page-architect-context'
import { PageArchitectTurn } from './turn'

export type PageArchitectMessage = UIMessage<unknown, PageBuilderDataParts>

/** The server keeps at most this many messages of history; trim before sending. */
export const MAX_SENT_MESSAGES = 20

/** The last `MAX_SENT_MESSAGES`, starting at a user message (the server trims the same way). */
export function recentMessages<T extends { role: string }>(messages: T[]): T[] {
  const capped = messages.slice(-MAX_SENT_MESSAGES)
  const first = capped.findIndex((m) => m.role === 'user')
  return first > 0 ? capped.slice(first) : capped
}

const HEX = /^#[0-9a-f]{6}$/i

/**
 * A `data-theme-preview` payload we can render, or null. Accepts the core contract
 * `{preset, primary}` and the theme kit's own vocabulary `{theme, brand}`.
 */
export function parseThemePreview(value: unknown): ThemePreview | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const preset = v.preset ?? v.theme
  const primary = v.primary ?? v.brand
  if (!isKitThemeId(preset) || typeof primary !== 'string' || !HEX.test(primary.trim())) return null
  return { preset, primary: primary.trim().toUpperCase() }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export interface UsePageArchitectOptions {
  pageId: string
  locale: 'en' | 'es'
  /** A human undo/redo stopped the turn. */
  onHistoryAbort?: () => void
}

export function usePageArchitect({ pageId, locale, onHistoryAbort }: UsePageArchitectOptions) {
  const controller = usePageArchitectContext()
  const getPuck = useGetPuck()

  // Latest values for callbacks that run outside render (transport, stream callbacks).
  const live = useRef({ getPuck, pageId, locale, controller, onHistoryAbort })
  useEffect(() => {
    live.current = { getPuck, pageId, locale, controller, onHistoryAbort }
  })

  const [statusLabel, setStatusLabel] = useState<string | null>(null)
  const [lastApplied, setLastApplied] = useState<number | null>(null)
  const turnRef = useRef<PageArchitectTurn | null>(null)
  const openTurns = useRef(0)

  const transport = useMemo(
    () =>
      // The callback reads `live` at send time (an event), not during render.
      // eslint-disable-next-line react-hooks/refs
      new DefaultChatTransport<PageArchitectMessage>({
        api: '/api/landing/chat',
        // Read at send time, not render time: the page the AI sees is the editor's current,
        // unsaved state, and the block the user has selected right now.
        prepareSendMessagesRequest: ({ id, messages, body }) => {
          const { getPuck: get, pageId: page, locale: lang } = live.current
          const puck = get()
          const selectedId = puck.selectedItem?.props?.id
          return {
            body: {
              ...(body ?? {}),
              chatId: id,
              messages: recentMessages(messages),
              pageId: page,
              pageData: puck.appState.data,
              selectedId: typeof selectedId === 'string' ? selectedId : undefined,
              locale: lang,
            },
          }
        },
      }),
    []
  )

  const ensureTurn = useCallback((): PageArchitectTurn => {
    const current = turnRef.current
    if (current && !current.isEnding) return current
    const turn = new PageArchitectTurn({
      getPuck: () => live.current.getPuck() as unknown as ReturnType<GetPuck>,
      typewriter: !prefersReducedMotion(),
      onWarning: (warning) => {
        if (process.env.NODE_ENV !== 'production') console.warn('[page-architect]', warning)
      },
    })
    turnRef.current = turn
    openTurns.current++
    setLastApplied(null)
    live.current.controller.setTurnActive(true)
    return turn
  }, [])

  const endTurn = useCallback(async () => {
    const turn = turnRef.current
    if (!turn) return
    turnRef.current = null
    const result = await turn.end()
    openTurns.current = Math.max(0, openTurns.current - 1)
    // Unlock only once the history entry exists and no newer turn has started.
    if (openTurns.current === 0) live.current.controller.setTurnActive(false)
    setStatusLabel(null)
    if (result.committed) {
      setLastApplied(result.applied)
      live.current.controller.onAiCommit()
    }
    if (result.abortedByHistory) live.current.onHistoryAbort?.()
  }, [])

  const chat = useChat<PageArchitectMessage>({
    id: pageId,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onData: (part) => {
      if (part.type === 'data-page-op') ensureTurn().push(part.data)
      else if (part.type === 'data-turn-status') setStatusLabel(part.data?.error ? null : (part.data?.label ?? null))
      else if (part.type === 'data-theme-preview') {
        const preview = parseThemePreview(part.data)
        if (preview) live.current.controller.setThemePreview(preview)
      }
    },
    onFinish: () => void endTurn(),
    onError: () => void endTurn(),
  })

  const { status, stop } = chat

  // Lock on the way in, unlock on the way out (onFinish also ends it; endTurn is idempotent).
  const wasActive = useRef(false)
  useEffect(() => {
    const active = status === 'submitted' || status === 'streaming'
    if (active && !wasActive.current) ensureTurn()
    if (!active && wasActive.current) void endTurn()
    wasActive.current = active
  }, [status, ensureTurn, endTurn])

  // A human undo/redo mid-turn: stop the stream, apply nothing more, commit nothing (A3).
  useEffect(() => {
    controller.setHistoryAbortHandler(() => {
      const turn = turnRef.current
      if (!turn) return
      turn.abortForeign()
      void stop()
    })
    return () => controller.setHistoryAbortHandler(null)
  }, [controller, stop])

  // Swallow the history hotkeys while a turn streams: Puck binds them unconditionally (A3).
  useEffect(() => {
    if (!controller.turnActive) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' || key === 'y') {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [controller.turnActive])

  // Leaving the editor mid-turn: stop the request (a ref, so a new `stop` never fires it).
  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  })
  useEffect(() => () => void stopRef.current(), [])

  return {
    ...chat,
    isBusy: status === 'submitted' || status === 'streaming',
    turnActive: controller.turnActive,
    statusLabel,
    lastApplied,
    clearLastApplied: () => setLastApplied(null),
  }
}
