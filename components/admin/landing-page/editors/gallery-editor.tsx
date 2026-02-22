'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TextField, TextareaField } from './editor-field'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { GallerySectionData, GalleryItem } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function GalleryEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.gallery')
  const d = data as unknown as GallerySectionData

  function set(key: keyof GallerySectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  function updateItem(idx: number, field: keyof GalleryItem, value: string) {
    const items = [...(d.items || [])]
    items[idx] = { ...items[idx], [field]: value }
    set('items', items)
  }

  function addItem() {
    set('items', [...(d.items || []), { src: '', alt: 'New image', caption: '' }])
  }

  function removeItem(idx: number) {
    set('items', (d.items || []).filter((_: unknown, i: number) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} placeholder={t('titlePlaceholder')} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} placeholder={t('subtitlePlaceholder')} />

      <div className="space-y-1.5">
        <Label>{t('columns')}</Label>
        <Select value={String(d.columns ?? 3)} onValueChange={v => v && set('columns', Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2">{t('columnsOption', { count: 2 })}</SelectItem>
            <SelectItem value="3">{t('columnsOption', { count: 3 })}</SelectItem>
            <SelectItem value="4">{t('columnsOption', { count: 4 })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('images')}</p>
          <Button variant="outline" size="sm" onClick={addItem}>
            <IconPlus className="w-3.5 h-3.5 mr-1" /> {t('add')}
          </Button>
        </div>
        {d.items?.map((item, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t('image', { index: idx + 1 })}</span>
              <button onClick={() => removeItem(idx)} className="text-destructive hover:text-destructive/80">
                <IconTrash className="w-3.5 h-3.5" />
              </button>
            </div>
            <TextField label={t('imageUrl')} value={item.src ?? ''} onChange={v => updateItem(idx, 'src', v)} placeholder="https://..." />
            <TextField label={t('altText')} value={item.alt ?? ''} onChange={v => updateItem(idx, 'alt', v)} placeholder={t('altTextPlaceholder')} />
            <TextField label={t('caption')} value={item.caption ?? ''} onChange={v => updateItem(idx, 'caption', v)} placeholder={t('captionPlaceholder')} />
          </div>
        ))}
      </div>
    </div>
  )
}
