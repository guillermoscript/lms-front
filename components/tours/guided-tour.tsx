'use client'

import { useEffect, useRef } from 'react'
import { driver, type DriveStep, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour-styles.css'
import { setUiState } from '@/app/actions/ui-state'
import { shouldStartTour } from '@/lib/tour-policy'
import { tourStateKey } from '@/lib/ui-state-keys'

interface GuidedTourProps {
  tourId: string
  userId: string
  steps: DriveStep[]
  // Tours are replay-only. Existing help triggers own every start.
  forceStart?: boolean
  // Retained as server-state inputs so #452 remains the source of truth for
  // completion and the user preference, even though neither can auto-start.
  completed?: boolean
  toursEnabled?: boolean
  onComplete?: () => void
}

function getStorageKey(tourId: string, userId: string): string {
  return `tour-completed:${tourId}:${userId}`
}

function markTourCompleted(tourId: string, userId: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(getStorageKey(tourId, userId), 'true')
  void setUiState(tourStateKey(tourId), 'completed')
}

export function GuidedTour({
  tourId,
  userId,
  steps,
  forceStart = false,
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

    if (shouldStartTour(forceStart)) {
      driverInstance.drive()
    }

    return () => {
      driverInstance.destroy()
      driverRef.current = null
    }
  }, [tourId, userId, steps, forceStart, onComplete])

  return null
}

export type { GuidedTourProps }
