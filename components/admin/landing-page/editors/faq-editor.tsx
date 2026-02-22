'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { FaqSectionData, FaqItem } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function FaqEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.faq')
  const d = data as unknown as FaqSectionData

  function set(key: keyof FaqSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  function updateItem(idx: number, key: keyof FaqItem, value: string) {
    const items = [...(d.items ?? [])]
    items[idx] = { ...items[idx], [key]: value }
    set('items', items)
  }

  function addItem() {
    set('items', [...(d.items ?? []), { question: 'New Question?', answer: 'Answer here.' }])
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
        {(d.items ?? []).map((item, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{t('item', { index: idx + 1 })}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                <IconTrash className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
            <TextField label={t('question')} value={item.question ?? ''} onChange={v => updateItem(idx, 'question', v)} />
            <TextareaField label={t('answer')} value={item.answer ?? ''} onChange={v => updateItem(idx, 'answer', v)} rows={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
