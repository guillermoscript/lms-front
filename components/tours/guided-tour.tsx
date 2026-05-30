'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { driver, type DriveStep, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour-styles.css'

interface GuidedTourProps {
  tourId: string
  userId: string
  steps: DriveStep[]
  autoStart?: boolean
  // Explicit replay (TourTrigger). Bypasses the `tours-disabled` kill-switch and
  // the per-tour completion flag — those only gate AUTO-start, not a deliberate
  // user replay. Without this, clicking "Replay tour" silently does nothing
  // whenever `tours-disabled` is set.
  forceStart?: boolean
  onComplete?: () => void
}

function getStorageKey(tourId: string, userId: string): string {
  return `tour-completed:${tourId}:${userId}`
}

function isTourCompleted(tourId: string, userId: string): boolean {
  if (typeof window === 'undefined') return true
  // Global kill-switch: skip all tours (useful for E2E tests and power users)
  if (localStorage.getItem('tours-disabled') === 'true') return true
  return localStorage.getItem(getStorageKey(tourId, userId)) === 'true'
}

function markTourCompleted(tourId: string, userId: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(getStorageKey(tourId, userId), 'true')
}

export function clearTourCompleted(tourId: string, userId: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(getStorageKey(tourId, userId))
}

export function GuidedTour({
  tourId,
  userId,
  steps,
  autoStart = true,
  forceStart = false,
  onComplete,
}: GuidedTourProps) {
  const driverRef = useRef<Driver | null>(null)
  const [key, setKey] = useState(0)

  const restart = useCallback(() => {
    clearTourCompleted(tourId, userId)
    setKey((k) => k + 1)
  }, [tourId, userId])

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

    // A forced replay always starts; otherwise honour autoStart + the completion
    // / kill-switch gate. Forced replays start immediately (no 800ms auto delay).
    const shouldStart = forceStart || (autoStart && !isTourCompleted(tourId, userId))

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
  }, [tourId, userId, steps, autoStart, forceStart, onComplete, key])

  return null
}

export type { GuidedTourProps }
