'use client'

import { useTranslations } from 'next-intl'
import { TextField } from './editor-field'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { StatsSectionData, StatItem } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function StatsEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.stats')
  const d = data as unknown as StatsSectionData

  function set(key: keyof StatsSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  function updateItem(idx: number, key: keyof StatItem, value: string) {
    const items = [...(d.items ?? [])]
    items[idx] = { ...items[idx], [key]: value }
    set('items', items)
  }

  function addItem() {
    set('items', [...(d.items ?? []), { value: '100+', label: 'New Metric' }])
  }

  function removeItem(idx: number) {
    set('items', (d.items ?? []).filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t('items')}</Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <IconPlus className="w-3.5 h-3.5 mr-1" />
            {t('add')}
          </Button>
        </div>
        {(d.items ?? []).map((item, idx) => (
          <div key={idx} className="flex items-end gap-3 border rounded-lg p-3">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <TextField label={t('value')} value={item.value ?? ''} onChange={v => updateItem(idx, 'value', v)} placeholder="10,000+" />
              <TextField label={t('label')} value={item.label ?? ''} onChange={v => updateItem(idx, 'label', v)} placeholder="Students" />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)}>
              <IconTrash className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
