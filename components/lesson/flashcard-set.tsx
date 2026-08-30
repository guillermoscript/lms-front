'use client'

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'

interface FlashcardSetProps {
  cards: { front: string; back: string }[]
  className?: string
}

const HALF_FLIP_MS = 220

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const serverFalse = () => false

export function FlashcardSet({ cards, className }: FlashcardSetProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    serverFalse
  )
  // Mid-flip: the card is edge-on (rotateY(90deg)) and swaps its text there.
  const [edgeOn, setEdgeOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Only ever one face in the DOM: a two-faced 3D flip breaks (both texts
  // overlap, or the card vanishes) whenever an ancestor flattens the 3D
  // context — overflow/filter/transform on the lesson shell all do that.
  const flip = () => {
    if (prefersReducedMotion) {
      setFlipped((f) => !f)
      return
    }
    if (edgeOn) return
    setEdgeOn(true)
    timer.current = setTimeout(() => {
      setFlipped((f) => !f)
      setEdgeOn(false)
    }, HALF_FLIP_MS)
  }

  const goTo = (index: number) => {
    if (timer.current) clearTimeout(timer.current)
    setEdgeOn(false)
    setFlipped(false)
    setCurrentIndex(index)
  }

  const card = cards[currentIndex]
  if (!card) return null

  return (
    <div className={cn('my-6', className)}>
      {/* Card */}
      <div
        onClick={flip}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip() } }}
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Mostrando reverso. Clic para voltear.' : 'Mostrando frente. Clic para voltear.'}
        className="mx-auto h-48 w-full max-w-md cursor-pointer select-none"
        style={prefersReducedMotion ? undefined : { perspective: '1000px' }}
      >
        <div
          className={cn(
            'flex h-full items-center justify-center overflow-y-auto rounded-xl border p-6 shadow-sm',
            flipped ? 'border-primary/30 bg-muted' : 'bg-card'
          )}
          style={prefersReducedMotion ? undefined : {
            transition: `transform ${HALF_FLIP_MS}ms ${edgeOn ? 'ease-in' : 'ease-out'}`,
            transform: edgeOn ? 'rotateY(90deg)' : 'rotateY(0deg)',
          }}
        >
          <p className="text-center text-sm font-medium">
            {flipped ? card.back : card.front}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="rounded-md border p-2 text-muted-foreground hover:bg-muted disabled:opacity-30"
          aria-label="Tarjeta anterior"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm text-muted-foreground">
          {currentIndex + 1} / {cards.length}
        </span>
        <button
          type="button"
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === cards.length - 1}
          className="rounded-md border p-2 text-muted-foreground hover:bg-muted disabled:opacity-30"
          aria-label="Siguiente tarjeta"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        Clic en la tarjeta para voltear
      </p>
    </div>
  )
}
