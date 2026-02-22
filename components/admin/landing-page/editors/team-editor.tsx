'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { TeamSectionData, TeamMember } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function TeamEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.team')
  const d = data as unknown as TeamSectionData

  function set(key: keyof TeamSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  function updateItem(idx: number, key: keyof TeamMember, value: string) {
    const items = [...(d.items ?? [])]
    items[idx] = { ...items[idx], [key]: value }
    set('items', items)
  }

  function addItem() {
    set('items', [...(d.items ?? []), { name: 'Instructor Name', role: 'Instructor', bio: '', avatar: '' }])
  }

  function removeItem(idx: number) {
    set('items', (d.items ?? []).filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} rows={2} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t('items')}</Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <IconPlus className="w-3.5 h-3.5 mr-1" />
            {t('add')}
          </Button>
        </div>
        {(d.items ?? []).map((member, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{t('item', { index: idx + 1 })}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                <IconTrash className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TextField label={t('name')} value={member.name ?? ''} onChange={v => updateItem(idx, 'name', v)} />
              <TextField label={t('role')} value={member.role ?? ''} onChange={v => updateItem(idx, 'role', v)} />
            </div>
            <TextareaField label={t('bio')} value={member.bio ?? ''} onChange={v => updateItem(idx, 'bio', v)} rows={2} />
            <TextField label={t('avatar')} value={member.avatar ?? ''} onChange={v => updateItem(idx, 'avatar', v)} placeholder="https://..." />
          </div>
        ))}
      </div>
    </div>
  )
}
