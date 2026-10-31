'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconAlertCircle, IconLoader2 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'

const MAX_CHARS = 8000

export interface AttemptResult {
  score: number
  passed: boolean
  feedback: unknown
}

/**
 * The answer form: one cold, graded attempt through `/api/reto/attempt`. Mounted
 * by the public landing and by the dashboard route, so both grade the same way.
 */
export function ChallengePlayer({ token, onResult }: { token: string; onResult: (result: AttemptResult) => void }) {
  const t = useTranslations('challenges.page')
  const router = useRouter()
  const [answer, setAnswer] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        router.refresh() // the server now finds the stored attempt and renders it
      } else if (!res.ok || typeof body?.score !== 'number') {
        setError(t('errorGeneric'))
      } else {
        onResult({ score: body.score, passed: Boolean(body.passed), feedback: body.feedback })
      }
    } catch {
      setError(t('errorGeneric'))
    } finally {
      setPending(false)
    }
  }

  return (
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
  )
}
