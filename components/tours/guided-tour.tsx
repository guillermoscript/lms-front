'use client'

import { useEffect, useRef } from 'react'
import { driver, type DriveStep, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour-styles.css'
import { setUiState, clearUiState } from '@/app/actions/ui-state'
import { tourStateKey } from '@/lib/ui-state-keys'

interface GuidedTourProps {
  tourId: string
  userId: string
  steps: DriveStep[]
  autoStart?: boolean
  // Explicit replay (TourTrigger). Bypasses the tours-enabled setting and
  // the per-tour completion flag — those only gate AUTO-start, not a deliberate
  // user replay. Without this, clicking "Replay tour" silently does nothing
  // whenever tours are disabled.
  forceStart?: boolean
  // Server-persisted completion flag (user_ui_state), read in the page and
  // passed down. localStorage below is only an optimistic cache on top.
  completed?: boolean
  // Server-persisted "Show tips & tours" setting; false suppresses auto-start.
  toursEnabled?: boolean
  onComplete?: () => void
}

function getStorageKey(tourId: string, userId: string): string {
  return `tour-completed:${tourId}:${userId}`
}

// Optimistic client cache of the server state: covers the window before a
// server write lands / a stale router cache. The `tours-disabled` key doubles
// as the E2E kill-switch (tests/playwright/utils/auth.ts sets it on login)
// and as the local mirror of the Settings toggle.
function isTourCompletedLocally(tourId: string, userId: string): boolean {
  if (typeof window === 'undefined') return true
  if (localStorage.getItem('tours-disabled') === 'true') return true
  return localStorage.getItem(getStorageKey(tourId, userId)) === 'true'
}

function markTourCompleted(tourId: string, userId: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(getStorageKey(tourId, userId), 'true')
  void setUiState(tourStateKey(tourId), 'completed')
}

export function clearTourCompleted(tourId: string, userId: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(getStorageKey(tourId, userId))
  void clearUiState(tourStateKey(tourId))
}

export function GuidedTour({
  tourId,
  userId,
  steps,
  autoStart = true,
  forceStart = false,
  completed = false,
  toursEnabled = true,
  onComplete,
}: GuidedTourProps) {
  const driverRef = useRef<Driver | null>(null)

  useEffect(() => {
    if (steps.length === 0) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    const driverInstance = driver({
      animate: !prefersReducedMotion,
      showProgress: true,
      popoverClass: 'guided-tour-popover',
      steps,
      onDestroyStarted: () => {
        markTourCompleted(tourId, userId)
        driverInstance.destroy()
        onComplete?.()
      },
    })

    driverRef.current = driverInstance

    // A forced replay always starts; otherwise honour autoStart, the server
    // completion/setting props, and the local cache. Forced replays start
    // immediately (no 800ms auto delay).
    const shouldStart =
      forceStart ||
      (autoStart &&
        toursEnabled &&
        !completed &&
        !isTourCompletedLocally(tourId, userId))

    if (shouldStart) {
      const timer = setTimeout(() => {
        driverInstance.drive()
      }, forceStart ? 0 : 800)

      return () => {
        clearTimeout(timer)
        driverInstance.destroy()
        driverRef.current = null
      }
    }

    return () => {
      driverInstance.destroy()
      driverRef.current = null
    }
  }, [tourId, userId, steps, autoStart, forceStart, completed, toursEnabled, onComplete])

  return null
}

export type { GuidedTourProps }
