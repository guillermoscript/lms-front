'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconCircleCheck, IconCards } from '@tabler/icons-react'
import { gradeReviewCard, REVIEW_RATINGS, type ReviewRating } from '@lms/core'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface ReviewSessionCard {
  id: number
  front: string
  back: string
}

interface ReviewSessionProps {
  userId: string
  tenantId: string
  cards: ReviewSessionCard[]
  /** Due right now in total — can exceed `cards` when the session is capped. */
  totalDue: number
}

const RATING_STYLE: Record<ReviewRating, string> = {
  again: 'border-destructive/40 text-destructive hover:bg-destructive/10',
  hard: 'border-warning/40 text-warning hover:bg-warning/10',
  good: 'border-success/40 text-success hover:bg-success/10',
  easy: 'border-primary/40 text-brand-text hover:bg-primary/10',
}

/**
 * One review pass (#849): show the front, reveal the back, self-rate
 * Again/Hard/Good/Easy. Every rating is scheduled by `gradeReviewCard` from
 * `@lms/core` — the same FSRS code the MCP widget and the native app use — on
 * the student's own token. "Again" puts the card back at the end of this
 * session, since FSRS makes it due again within minutes.
 *
 * Keys: Space/Enter reveals, 1–4 rate.
 */
export function ReviewSession({ userId, tenantId, cards, totalDue }: ReviewSessionProps) {
  const t = useTranslations('dashboard.student.reviews')
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [queue, setQueue] = useState(cards)
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState<Set<number>>(() => new Set())
  const [graded, setGraded] = useState(0)

  const card = queue[0]

  const rate = useCallback(
    async (rating: ReviewRating) => {
      if (!card || !revealed || saving) return
      setSaving(true)
      const result = await gradeReviewCard(supabase, userId, tenantId, card.id, rating)
      setSaving(false)
      if (!result.ok) {
        toast.error(t('gradeError'))
        return
      }
      setGraded((n) => n + 1)
      setRevealed(false)
      setQueue(([head, ...rest]) => (rating === 'again' ? [...rest, head] : rest))
      if (rating !== 'again') setFinished((s) => new Set(s).add(card.id))
    },
    [card, revealed, saving, supabase, userId, tenantId, t]
  )

  useEffect(() => {
    if (!card) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealed(true)
        return
      }
      const index = Number(e.key) - 1
      if (revealed && index >= 0 && index < REVIEW_RATINGS.length) {
        e.preventDefault()
        rate(REVIEW_RATINGS[index])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, revealed, rate])

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center" data-testid="reviews-empty">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <IconCards className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold mb-1">{t('emptyTitle')}</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">{t('emptyDescription')}</p>
        <Link href="/dashboard/student">
          <Button variant="outline">{t('backToDashboard')}</Button>
        </Link>
      </div>
    )
  }

  if (!card) {
    const remaining = Math.max(0, totalDue - cards.length)
    return (
      <div className="rounded-2xl border bg-card p-8 text-center" data-testid="reviews-done">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
          <IconCircleCheck className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold mb-1">{t('doneTitle')}</h2>
        <p className="text-sm text-muted-foreground mb-6">{t('doneDescription', { count: graded })}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {remaining > 0 && (
            <Button onClick={() => router.refresh()}>{t('reviewMore', { count: remaining })}</Button>
          )}
          <Link href="/dashboard/student">
            <Button variant="outline">{t('backToDashboard')}</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5" data-testid="review-session">
      <Progress
        value={Math.round((finished.size / cards.length) * 100)}
        aria-label={t('progress', { done: finished.size, total: cards.length })}
      >
        <span className="text-xs text-muted-foreground tabular-nums ml-auto">
          {t('progress', { done: finished.size, total: cards.length })}
        </span>
      </Progress>

      <div
        className="rounded-2xl border bg-card shadow-sm min-h-64 flex flex-col"
        data-testid="review-card"
      >
        <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
          <p className="text-center text-lg font-medium whitespace-pre-wrap break-words">{card.front}</p>
        </div>
        {revealed && (
          <div
            className="border-t bg-muted/40 p-6 sm:p-10 flex items-center justify-center rounded-b-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
            data-testid="review-card-back"
          >
            <p className="text-center whitespace-pre-wrap break-words">{card.back}</p>
          </div>
        )}
      </div>

      <div aria-live="polite">
        {revealed ? (
          <div className="space-y-2">
            <p className="text-center text-sm text-muted-foreground">{t('howWell')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {REVIEW_RATINGS.map((rating, i) => (
                <Button
                  key={rating}
                  variant="outline"
                  size="lg"
                  disabled={saving}
                  onClick={() => rate(rating)}
                  className={cn('flex-col h-auto py-2.5 gap-0.5', RATING_STYLE[rating])}
                  data-testid={`review-rate-${rating}`}
                >
                  <span className="font-semibold">{t(`rating.${rating}`)}</span>
                  <span className="text-[11px] opacity-70 hidden sm:inline">{i + 1}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Button size="lg" className="w-full sm:w-auto" onClick={() => setRevealed(true)} data-testid="review-reveal">
              {t('showAnswer')}
            </Button>
            <p className="text-xs text-muted-foreground hidden sm:block">{t('keyboardHint')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
