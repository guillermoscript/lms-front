'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'

interface FlashcardSetProps {
  cards: { front: string; back: string }[]
  className?: string
}

export function FlashcardSet({ cards, className }: FlashcardSetProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const goTo = (index: number) => {
    setFlipped(false)
    setCurrentIndex(index)
  }

  const card = cards[currentIndex]
  if (!card) return null

  return (
    <div className={cn('my-6', className)}>
      {/* Card */}
      <div
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped((f) => !f) } }}
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Mostrando reverso. Clic para voltear.' : 'Mostrando frente. Clic para voltear.'}
        className="relative mx-auto h-48 w-full max-w-md cursor-pointer select-none"
        style={prefersReducedMotion ? undefined : { perspective: '1000px' }}
      >
        <div
          className="relative h-full w-full"
          style={prefersReducedMotion ? undefined : {
            transformStyle: 'preserve-3d',
            transition: 'transform 0.5s',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {prefersReducedMotion ? (
            <div className="flex h-full items-center justify-center rounded-xl border bg-card p-6 shadow-sm">
              <p className="text-center text-sm font-medium">
                {flipped ? card.back : card.front}
              </p>
            </div>
          ) : (
            <>
              {/* Front */}
              <div
                className="absolute inset-0 flex items-center justify-center rounded-xl border bg-card p-6 shadow-sm"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <p className="text-center text-sm font-medium">{card.front}</p>
              </div>
              {/* Back */}
              <div
                className="absolute inset-0 flex items-center justify-center rounded-xl border bg-primary/5 p-6 shadow-sm"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <p className="text-center text-sm font-medium">{card.back}</p>
              </div>
            </>
          )}
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
