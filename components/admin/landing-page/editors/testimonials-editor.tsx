'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { TestimonialsSectionData, TestimonialItem } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function TestimonialsEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.testimonials')
  const d = data as unknown as TestimonialsSectionData

  function set(key: keyof TestimonialsSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  function updateItem(idx: number, key: keyof TestimonialItem, value: string) {
    const items = [...(d.items ?? [])]
    items[idx] = { ...items[idx], [key]: value }
    set('items', items)
  }

  function addItem() {
    set('items', [...(d.items ?? []), { name: 'Student Name', role: 'Student', quote: 'This course was amazing!', avatar: '' }])
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
            <div className="grid grid-cols-2 gap-2">
              <TextField label={t('name')} value={item.name ?? ''} onChange={v => updateItem(idx, 'name', v)} />
              <TextField label={t('role')} value={item.role ?? ''} onChange={v => updateItem(idx, 'role', v)} placeholder="Student, Developer..." />
            </div>
            <TextareaField label={t('quote')} value={item.quote ?? ''} onChange={v => updateItem(idx, 'quote', v)} rows={3} />
            <TextField label={t('avatar')} value={item.avatar ?? ''} onChange={v => updateItem(idx, 'avatar', v)} placeholder="https://..." />
          </div>
        ))}
      </div>
    </div>
  )
}
