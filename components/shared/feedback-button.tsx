'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { IconBug } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import {
  isFeedbackAvailable,
  openFeedbackDialog,
  syncFeedbackTheme,
} from '@/lib/sentry/feedback'

/** Diameter of the puck. 44px is the minimum comfortable touch target. */
const SIZE = 44
/** Gap kept between the puck and the viewport edges, on top of any safe-area inset. */
const MARGIN = 12
/** Pointer travel that turns a tap into a drag. Below this, a release opens the form. */
const DRAG_THRESHOLD = 8
/** Vertical resting place, as a fraction of the draggable range. Clear of the header and of bottom action bars. */
const DEFAULT_Y_FRACTION = 0.62
/** Keyboard nudge, as a fraction of the draggable range. */
const NUDGE = 0.08

const STORAGE_KEY = 'lms.feedback-button.position'

type Side = 'left' | 'right'
type Position = { side: Side; yFraction: number }
type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

const DEFAULT_POSITION: Position = { side: 'right', yFraction: DEFAULT_Y_FRACTION }

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

function readStoredPosition(): Position {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_POSITION
    const parsed = JSON.parse(raw) as Partial<Position>
    if (parsed.side !== 'left' && parsed.side !== 'right') return DEFAULT_POSITION
    if (typeof parsed.yFraction !== 'number' || !Number.isFinite(parsed.yFraction)) {
      return DEFAULT_POSITION
    }
    return { side: parsed.side, yFraction: clamp(parsed.yFraction, 0, 1) }
  } catch {
    return DEFAULT_POSITION
  }
}

function writeStoredPosition(position: Position) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
  } catch {
    // Private mode or a full quota: the puck just falls back to its default next load.
  }
}

/**
 * The SDK registers its integrations from `instrumentation-client.ts`, which can land
 * after this component mounts, so availability is polled rather than read once. Modelled
 * as an external store so hydration uses the server snapshot (`false`) and the puck
 * can't appear in the first client render where the server rendered nothing.
 */
function subscribeToFeedback(onChange: () => void) {
  if (isFeedbackAvailable()) return () => {}
  const timer = window.setInterval(() => {
    if (isFeedbackAvailable()) {
      window.clearInterval(timer)
      onChange()
    }
  }, 500)
  // Give up after 10s: something (usually an ad blocker) took the integration.
  const stop = window.setTimeout(() => window.clearInterval(timer), 10_000)
  return () => {
    window.clearInterval(timer)
    window.clearTimeout(stop)
  }
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const serverFalse = () => false

/**
 * A draggable, self-effacing trigger for the Sentry feedback form.
 *
 * Reporting a bug is a rare action, so the puck holds as little screen as it can:
 * it rests at 44px, icon-only and dimmed, and it defaults to the right edge at 62%
 * height, clear of both the dashboard header and the bottom action bars that carry
 * the primary action (the lesson footer's "Next" button, which the SDK's own
 * auto-injected actor button used to sit on top of).
 *
 * Whatever default is chosen is still wrong for someone, so the puck can be dragged
 * anywhere, snaps to the nearest edge, and remembers where it was parked.
 */
export function FeedbackButton() {
  const t = useTranslations('components.feedbackButton')
  const { resolvedTheme } = useTheme()

  const buttonRef = useRef<HTMLButtonElement>(null)
  const safeAreaProbeRef = useRef<HTMLSpanElement>(null)

  const available = useSyncExternalStore(
    subscribeToFeedback,
    isFeedbackAvailable,
    serverFalse
  )
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    serverFalse
  )

  // Read straight from storage rather than syncing in an effect: the button only
  // renders once `bounds` is measured, well after hydration, so the initial value
  // never reaches the DOM the server produced.
  const [position, setPosition] = useState<Position>(() =>
    typeof window === 'undefined' ? DEFAULT_POSITION : readStoredPosition()
  )
  const [bounds, setBounds] = useState<Bounds | null>(null)
  /** Live pointer position while dragging; null when resting at `position`. */
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)

  const gestureRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
    /** Latest clamped position, mirrored here so pointerup never reads stale state. */
    x: number
    y: number
  } | null>(null)
  const openingRef = useRef(false)
  /**
   * Set when a gesture turned out to be a drag, so the `click` that follows
   * `pointerup` doesn't also open the dialog. Opening lives on `click` rather than
   * on `pointerup` so Enter and Space work without any extra handling.
   */
  const suppressClickRef = useRef(false)

  const measure = useCallback(() => {
    // The probe carries `env(safe-area-inset-*)` as padding, which computed style
    // resolves to pixels. Reading it here keeps the puck off the notch and off the
    // iOS home indicator without hardcoding device guesses.
    const probe = safeAreaProbeRef.current
    const insets = probe
      ? {
          top: parseFloat(getComputedStyle(probe).paddingTop) || 0,
          right: parseFloat(getComputedStyle(probe).paddingRight) || 0,
          bottom: parseFloat(getComputedStyle(probe).paddingBottom) || 0,
          left: parseFloat(getComputedStyle(probe).paddingLeft) || 0,
        }
      : { top: 0, right: 0, bottom: 0, left: 0 }

    const width = window.innerWidth
    const height = window.innerHeight

    setBounds({
      minX: MARGIN + insets.left,
      maxX: Math.max(MARGIN + insets.left, width - SIZE - MARGIN - insets.right),
      minY: MARGIN + insets.top,
      maxY: Math.max(MARGIN + insets.top, height - SIZE - MARGIN - insets.bottom),
    })
  }, [])

  useEffect(() => {
    if (!available) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [available, measure])

  useEffect(() => {
    if (!available || !resolvedTheme) return
    syncFeedbackTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
  }, [available, resolvedTheme])

  const restingX = bounds ? (position.side === 'right' ? bounds.maxX : bounds.minX) : 0
  const restingY = bounds
    ? bounds.minY + position.yFraction * (bounds.maxY - bounds.minY)
    : 0

  const x = dragOffset?.x ?? restingX
  const y = dragOffset?.y ?? restingY

  const commit = useCallback((next: Position) => {
    setPosition(next)
    writeStoredPosition(next)
  }, [])

  const open = useCallback(async () => {
    if (openingRef.current) return
    openingRef.current = true
    try {
      await openFeedbackDialog()
    } finally {
      openingRef.current = false
    }
  }, [])

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    // Ignore secondary mouse buttons; touch and pen report button 0 too.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (!bounds) return

    // Cleared on every new gesture, so a browser that skips `click` after a drag
    // can't leave the flag set and swallow the next genuine tap.
    suppressClickRef.current = false
    // Capture keeps the moves coming once the pointer leaves the 44px circle. It can
    // throw if the pointer is already gone; the gesture is still worth tracking.
    try {
      buttonRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // Non-fatal: without capture, drags outside the button just stop early.
    }
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: restingX,
      originY: restingY,
      moved: false,
      x: restingX,
      y: restingY,
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || !bounds) return

    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY

    if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    gesture.moved = true

    gesture.x = clamp(gesture.originX + dx, bounds.minX, bounds.maxX)
    gesture.y = clamp(gesture.originY + dy, bounds.minY, bounds.maxY)
    setDragOffset({ x: gesture.x, y: gesture.y })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    try {
      buttonRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      // Already released by the browser.
    }
    setDragOffset(null)

    // A tap falls through to `click`, which is what opens the dialog.
    if (!gesture.moved) return

    suppressClickRef.current = true
    if (bounds) {
      const range = bounds.maxY - bounds.minY
      commit({
        side: gesture.x + SIZE / 2 < window.innerWidth / 2 ? 'left' : 'right',
        yFraction: range > 0 ? clamp((gesture.y - bounds.minY) / range, 0, 1) : 0,
      })
    }
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLButtonElement>) {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    gestureRef.current = null
    suppressClickRef.current = true
    setDragOffset(null)
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    void open()
  }

  // Dragging is pointer-only, so keyboard users get arrow-key repositioning.
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    let next: Position | null = null
    if (event.key === 'ArrowUp') {
      next = { ...position, yFraction: clamp(position.yFraction - NUDGE, 0, 1) }
    } else if (event.key === 'ArrowDown') {
      next = { ...position, yFraction: clamp(position.yFraction + NUDGE, 0, 1) }
    } else if (event.key === 'ArrowLeft') {
      next = { ...position, side: 'left' }
    } else if (event.key === 'ArrowRight') {
      next = { ...position, side: 'right' }
    }
    if (!next) return
    event.preventDefault()
    commit(next)
  }

  if (!available) return null

  const dragging = dragOffset !== null

  return (
    <>
      {/* Zero-size probe: resolves the safe-area insets to pixels for `measure()`. */}
      <span
        ref={safeAreaProbeRef}
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 h-0 w-0"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      />
      {bounds && (
        <button
          ref={buttonRef}
          type="button"
          data-testid="feedback-button"
          aria-label={t('label')}
          title={`${t('label')} (${t('dragHint')})`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(
            // `fixed` at the origin and moved with `transform` only: position never
            // touches a layout property, so snapping stays on the compositor.
            'fixed top-0 left-0 z-40 grid place-items-center rounded-full',
            'border border-border/60 bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm',
            'cursor-grab touch-none select-none',
            // Resting state is deliberately faint: it should read as available, not as
            // something demanding attention while the user is reading a lesson.
            'opacity-45',
            'hover:scale-105 hover:bg-card hover:text-foreground hover:opacity-100',
            'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            dragging && 'scale-110 cursor-grabbing opacity-100 shadow-md'
          )}
          style={{
            width: SIZE,
            height: SIZE,
            transform: `translate3d(${x}px, ${y}px, 0)`,
            // Set here rather than via utilities because the transitioned property
            // list changes with state: `transform` must be excluded while dragging so
            // the puck tracks the finger exactly, and included on release so it eases
            // into its snapped edge. Two Tailwind transition-* classes would just
            // overwrite each other's `transition-property`.
            transitionProperty: [
              !dragging && !reducedMotion && 'transform',
              'opacity',
              'color',
              'background-color',
              !reducedMotion && 'scale',
              'box-shadow',
            ]
              .filter(Boolean)
              .join(', '),
            transitionDuration: '200ms',
            // ease-out-quart
            transitionTimingFunction: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
          }}
        >
          <IconBug className="h-[18px] w-[18px]" aria-hidden />
        </button>
      )}
    </>
  )
}
