'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ImageTextSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function ImageTextEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.imageText')
  const d = data as unknown as ImageTextSectionData

  function set(key: keyof ImageTextSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} />
      <TextareaField label={t('content')} value={d.content ?? ''} onChange={v => set('content', v)} rows={4} />
      <TextField label={t('imageSrc')} value={d.imageSrc ?? ''} onChange={v => set('imageSrc', v)} placeholder="https://..." />
      <TextField label={t('imageAlt')} value={d.imageAlt ?? ''} onChange={v => set('imageAlt', v)} placeholder="Descriptive alt text" />
      <div className="space-y-1.5">
        <Label>{t('imagePosition')}</Label>
        <Select value={d.imagePosition ?? 'right'} onValueChange={v => v && set('imagePosition', v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">{t('left')}</SelectItem>
            <SelectItem value="right">{t('right')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
