'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { FeaturesSectionData, FeatureItem } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function FeaturesEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.features')
  const d = data as unknown as FeaturesSectionData

  function set(key: keyof FeaturesSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  function updateItem(idx: number, key: keyof FeatureItem, value: string) {
    const items = [...(d.items ?? [])]
    items[idx] = { ...items[idx], [key]: value }
    set('items', items)
  }

  function addItem() {
    set('items', [...(d.items ?? []), { icon: '⭐', title: 'New Feature', description: '' }])
  }

  function removeItem(idx: number) {
    set('items', (d.items ?? []).filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <TextField label={t('sectionTitle')} value={d.title ?? ''} onChange={v => set('title', v)} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} rows={2} />
      <div className="space-y-1.5">
        <Label>{t('columns')}</Label>
        <Select value={String(d.columns ?? 3)} onValueChange={v => v && set('columns', Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">{t('columnsOption', { count: 2 })}</SelectItem>
            <SelectItem value="3">{t('columnsOption', { count: 3 })}</SelectItem>
            <SelectItem value="4">{t('columnsOption', { count: 4 })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t('featureItems')}</Label>
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
            <div className="grid grid-cols-3 gap-2">
              <TextField label={t('icon')} value={item.icon ?? ''} onChange={v => updateItem(idx, 'icon', v)} placeholder="🎓" />
              <div className="col-span-2">
                <TextField label={t('itemTitle')} value={item.title ?? ''} onChange={v => updateItem(idx, 'title', v)} />
              </div>
            </div>
            <TextareaField label={t('description')} value={item.description ?? ''} onChange={v => updateItem(idx, 'description', v)} rows={2} />
          </div>
        ))}
      </div>
    </div>
  )
}
