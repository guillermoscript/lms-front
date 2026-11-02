'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createChallengeGroup } from '@/app/actions/challenge-groups'
import { GROUP_NAME_MAX } from '@/lib/challenges/group-constants'

export function CreateGroupForm() {
  const t = useTranslations('challenges.groups')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    setError(null)
    start(async () => {
      const r = await createChallengeGroup(name)
      if (r.success) router.push(`/dashboard/student/groups/${r.data.id}`)
      else setError(t(`errors.${r.code}`))
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="create-group-form">
      <div className="space-y-2">
        <Label htmlFor="group-name">{t('nameLabel')}</Label>
        <Input id="group-name" name="name" required maxLength={GROUP_NAME_MAX} placeholder={t('namePlaceholder')} autoComplete="off" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} data-testid="create-group-submit">
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? t('creating') : t('create')}
      </Button>
    </form>
  )
}
