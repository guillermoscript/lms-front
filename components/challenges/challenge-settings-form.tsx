'use client'

import { useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_GUEST_MONTHLY_CAP } from '@/lib/challenges/settings'
import { updateChallengeSettings } from '@/app/actions/admin/settings'
import type { SettingsGroup } from '@/app/actions/admin/settings'

interface Props {
  settings: SettingsGroup
}

/** The cap is stored as a bare integer; tolerate `{ value }` too. */
function readCap(entry: SettingsGroup[string]): string {
  const raw = entry?.value as unknown
  const n = typeof raw === 'number' ? raw : (raw as { value?: unknown } | null)?.value
  return typeof n === 'number' || (typeof n === 'string' && n !== '') ? String(n) : ''
}

export function ChallengeSettingsForm({ settings }: Props) {
  const t = useTranslations('challenges.admin.settings')
  const [saving, setSaving] = useState(false)
  const enabled = settings.challenges_enabled?.value?.enabled === true
  const cap = readCap(settings.challenges_guest_monthly_cap)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const rawCap = String(form.get('cap') ?? '').trim()
    setSaving(true)
    try {
      const result = await updateChallengeSettings({
        enabled: form.get('enabled') === 'on',
        guestMonthlyCap: rawCap === '' ? null : Number(rawCap),
      })
      if (result.success) toast.success(t('saved'))
      else toast.error(result.error === 'invalid_cap' ? t('invalidCap') : t('error'))
    } catch {
      toast.error(t('error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="challenge-settings-form">
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="challenges_enabled">{t('enabled')}</Label>
          <p className="text-sm text-muted-foreground">{t('enabledHint')}</p>
        </div>
        <Switch id="challenges_enabled" name="enabled" defaultChecked={enabled} />
      </div>
      <div className="space-y-2 rounded-lg border p-4">
        <Label htmlFor="challenges_guest_monthly_cap">{t('cap')}</Label>
        <Input
          id="challenges_guest_monthly_cap"
          name="cap"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          defaultValue={cap}
          placeholder={String(DEFAULT_GUEST_MONTHLY_CAP)}
          className="max-w-40"
        />
        <p className="text-sm text-muted-foreground">{t('capHint', { default: DEFAULT_GUEST_MONTHLY_CAP })}</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  )
}
