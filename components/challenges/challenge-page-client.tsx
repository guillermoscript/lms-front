'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Markdown from 'react-markdown'
import { IconAlertCircle, IconCircleCheck, IconCircleX, IconLoader2 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ChallengeShareButton } from './challenge-share-button'
import { ChallengeClaimSlot, ChallengeDuelSlot, type ChallengeResultContext } from './challenge-page-slots'

const MAX_CHARS = 8000

interface AttemptResult {
  score: number
  passed: boolean
  feedback: unknown
}

export interface ChallengePageClientProps {
  token: string
  exerciseId: number
  title: string
  instructions: string
  passingScore: number
  challenger: { score: number; passed: boolean; name: string | null } | null
  /** The signed-in viewer is the challenger: show the card and share, not the form. */
  isOwner: boolean
}

/** Feedback arrives as a string or as `{ feedback, strengths, improvements }` (WS2 contract). */
function feedbackText(feedback: unknown): string {
  if (typeof feedback === 'string') return feedback
  if (feedback && typeof feedback === 'object' && typeof (feedback as { feedback?: unknown }).feedback === 'string') {
    return (feedback as { feedback: string }).feedback
  }
  return ''
}

function PassedBadge({ passed }: { passed: boolean }) {
  const t = useTranslations('challenges.page')
  const Icon = passed ? IconCircleCheck : IconCircleX
  return (
    <span
      className={
        passed
          ? 'inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-0.5 text-xs font-medium text-success-foreground'
          : 'inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      <Icon className="size-3.5" aria-hidden />
      {passed ? t('passed') : t('notPassed')}
    </span>
  )
}

export function ChallengePageClient(props: ChallengePageClientProps) {
  const { token, exerciseId, title, instructions, passingScore, challenger, isOwner } = props
  const t = useTranslations('challenges.page')
  const [answer, setAnswer] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AttemptResult | null>(null)

  const challengerName = challenger?.name ?? t('guestName')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!answer.trim() || pending) return
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/reto/attempt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, answer: answer.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (res.status === 429) {
        setError(t('errorRateLimited'))
      } else if (res.status === 402 || res.status === 503) {
        setError(t('errorPaused'))
      } else if (res.status === 409) {
        setError(t('errorAlreadyPlayed'))
      } else if (!res.ok || typeof body?.score !== 'number') {
        setError(t('errorGeneric'))
      } else {
        setResult({ score: body.score, passed: Boolean(body.passed), feedback: body.feedback })
      }
    } catch {
      setError(t('errorGeneric'))
    } finally {
      setPending(false)
    }
  }

  const ctx: ChallengeResultContext | null = result
    ? {
        token,
        exerciseId,
        guestScore: result.score,
        guestPassed: result.passed,
        challengerScore: challenger?.score ?? null,
        challengerName: challenger?.name ?? null,
      }
    : null

  const shareText = challenger
    ? t('shareText', { name: challengerName, score: challenger.score, exercise: title })
    : title

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 md:py-14">
      <header className="space-y-3">
        {challenger ? (
          <section aria-labelledby="challenger-heading" className="space-y-2" data-testid="challenger-card">
            <p className="text-sm font-medium text-muted-foreground">{t('eyebrow')}</p>
            <h1 id="challenger-heading" className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
              {t('challengerLine', { name: challengerName, score: challenger.score, exercise: title })}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-4xl font-semibold tabular-nums">{challenger.score}</span>
              <PassedBadge passed={challenger.passed} />
              <span className="text-sm text-muted-foreground">{t('passingScore', { score: passingScore })}</span>
            </div>
            {!isOwner ? <p className="text-base">{t('beatIt')}</p> : null}
          </section>
        ) : (
          <>
            <p className="text-sm font-medium text-muted-foreground">{t('eyebrow')}</p>
            <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          </>
        )}
      </header>

      {isOwner ? (
        <section className="space-y-3" aria-labelledby="share-heading">
          <h2 id="share-heading" className="text-lg font-semibold">{t('shareHeading')}</h2>
          <p className="text-sm text-muted-foreground">{t('shareBody')}</p>
          <ChallengeShareButton title={title} text={shareText} />
        </section>
      ) : null}

      <section aria-labelledby="instructions-heading" className="space-y-2">
        <h2 id="instructions-heading" className="text-sm font-semibold">{t('instructions')}</h2>
        <div className="prose prose-neutral max-w-[68ch] dark:prose-invert prose-p:leading-relaxed prose-p:text-foreground/85 prose-headings:text-base">
          <Markdown>{instructions}</Markdown>
        </div>
      </section>

      {!isOwner && !result ? (
        <form onSubmit={submit} className="space-y-3" aria-busy={pending}>
          <label htmlFor="challenge-answer" className="text-sm font-semibold">{t('yourAnswer')}</label>
          <Textarea
            id="challenge-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={MAX_CHARS}
            rows={10}
            disabled={pending}
            placeholder={t('answerPlaceholder')}
            className="min-h-48"
          />
          <p className="text-xs text-muted-foreground">{t('coldNote')}</p>
          {error ? (
            <Alert variant="destructive" role="alert">
              <IconAlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending || !answer.trim()} data-testid="challenge-submit">
            {pending ? <IconLoader2 className="animate-spin" /> : null}
            {pending ? t('grading') : t('submit')}
          </Button>
        </form>
      ) : null}

      {result && ctx ? (
        <section aria-labelledby="result-heading" className="space-y-5" data-testid="challenge-result" aria-live="polite">
          <h2 id="result-heading" className="text-lg font-semibold">{t('resultHeading')}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-5xl font-semibold tabular-nums" data-testid="challenge-score">{result.score}</span>
            <PassedBadge passed={result.passed} />
          </div>
          {feedbackText(result.feedback) ? (
            <p className="max-w-[68ch] text-base leading-relaxed text-foreground/85">{feedbackText(result.feedback)}</p>
          ) : null}
          {/* WS6 slot */}
          <ChallengeDuelSlot ctx={ctx} />
          {/* WS4 slot */}
          <ChallengeClaimSlot ctx={ctx} />
        </section>
      ) : null}
    </div>
  )
}
