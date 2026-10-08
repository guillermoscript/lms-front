'use client'

/**
 * Editor-level state shared by `<Puck>` props and the docked panel (which renders INSIDE
 * Puck through `overrides.puck`, so it can use `useGetPuck`).
 *
 * Puck regenerates its whole app store when `onAction`, `metadata`, `overrides` or `config`
 * change identity (critique A4), so everything handed to `<Puck>` here is stable:
 * `onAction` reads refs, and `permissions` flips between two module constants.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ThemePreview } from '@lms/core'
import { isOwnPuckAction } from './apply-op-to-puck'

/** Human edits are locked while an AI turn streams (the AI's own dispatches are not gated). */
export const LOCKED_PERMISSIONS = { drag: false, edit: false, insert: false, delete: false, duplicate: false }
export const UNLOCKED_PERMISSIONS = { drag: true, edit: true, insert: true, delete: true, duplicate: true }

export interface PageArchitectContextValue {
  /** An AI turn is applying ops (edits locked, metadata merges deferred). */
  turnActive: boolean
  setTurnActive: (active: boolean) => void
  /** The panel registers how to stop its turn when a human undo/redo lands mid-turn. */
  setHistoryAbortHandler: (fn: (() => void) | null) => void
  /** A live, unsaved theme preview scoped to the canvas. */
  themePreview: ThemePreview | null
  setThemePreview: (preview: ThemePreview | null) => void
  /** The AI changed the page (the editor's dirty flag listens). */
  onAiCommit: () => void
}

const PageArchitectContext = createContext<PageArchitectContextValue | null>(null)

export const PageArchitectProvider = PageArchitectContext.Provider

export function usePageArchitectContext(): PageArchitectContextValue {
  const value = useContext(PageArchitectContext)
  if (!value) throw new Error('usePageArchitectContext must be used inside <PageArchitectProvider>')
  return value
}

/** Is this Puck action a history move (undo/redo/setHistories) or a foreign whole-data swap? */
export function isForeignHistoryAction(action: { type?: unknown } | null | undefined): boolean {
  if (!action || (action.type !== 'set' && action.type !== 'setData')) return false
  return !isOwnPuckAction(action)
}

/**
 * Create the controller in the editor (outside `<Puck>`). Returns the context value plus the
 * stable props for `<Puck>`.
 */
export function usePageArchitectController({ onAiCommit }: { onAiCommit: () => void }) {
  const [turnActive, setTurnActiveState] = useState(false)
  const [themePreview, setThemePreview] = useState<ThemePreview | null>(null)
  const turnActiveRef = useRef(false)
  const abortRef = useRef<(() => void) | null>(null)
  const commitRef = useRef(onAiCommit)
  useEffect(() => {
    commitRef.current = onAiCommit
  })

  const setTurnActive = useCallback((active: boolean) => {
    turnActiveRef.current = active
    setTurnActiveState(active)
  }, [])

  const setHistoryAbortHandler = useCallback((fn: (() => void) | null) => {
    abortRef.current = fn
  }, [])

  const onAiCommitStable = useCallback(() => commitRef.current(), [])

  /** Stable for the editor's lifetime (critique A4). */
  const onAction = useCallback((action: { type?: unknown }) => {
    if (turnActiveRef.current && isForeignHistoryAction(action)) abortRef.current?.()
  }, [])

  const permissions = turnActive ? LOCKED_PERMISSIONS : UNLOCKED_PERMISSIONS

  const value = useMemo<PageArchitectContextValue>(
    () => ({
      turnActive,
      setTurnActive,
      setHistoryAbortHandler,
      themePreview,
      setThemePreview,
      onAiCommit: onAiCommitStable,
    }),
    [turnActive, setTurnActive, setHistoryAbortHandler, themePreview, onAiCommitStable]
  )

  return { value, onAction, permissions }
}
