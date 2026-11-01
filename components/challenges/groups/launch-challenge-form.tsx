'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { launchGroupChallenge } from '@/app/actions/challenge-groups'

export interface LaunchOption { id: number; title: string; courseTitle: string }

export function LaunchChallengeForm({ groupId, options, disabled }: { groupId: string; options: LaunchOption[]; disabled?: boolean }) {
  const t = useTranslations('challenges.groups.page')
  const te = useTranslations('challenges.groups.errors')
  const router = useRouter()
  const [exerciseId, setExerciseId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="launch-empty">{t('noExercises')}</p>
  }

  function launch() {
    if (!exerciseId) return
    setError(null)
    start(async () => {
      const r = await launchGroupChallenge(groupId, Number(exerciseId))
      if (r.success) {
        setExerciseId('')
        router.refresh()
      } else setError(te(r.code))
    })
  }

  return (
    <div className="space-y-3" data-testid="launch-form">
      <div className="space-y-2">
        <Label htmlFor="launch-exercise">{t('selectExercise')}</Label>
        <select
          id="launch-exercise"
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('selectExercise')}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.courseTitle ? `${o.courseTitle} · ${o.title}` : o.title}</option>
          ))}
        </select>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button onClick={launch} disabled={!exerciseId || pending || disabled} data-testid="launch-submit">
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? t('launching') : t('launch')}
      </Button>
    </div>
  )
}
