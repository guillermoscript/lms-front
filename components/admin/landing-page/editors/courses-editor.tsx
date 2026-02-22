'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { CoursesSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function CoursesEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.courses')
  const d = data as unknown as CoursesSectionData

  function set(key: keyof CoursesSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} rows={2} />
      <div className="space-y-1.5">
        <Label>{t('layout')}</Label>
        <Select value={d.layout ?? 'grid'} onValueChange={v => v && set('layout', v)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="grid">{t('grid')}</SelectItem>
            <SelectItem value="carousel">{t('carousel')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t('maxItems')}</Label>
        <Select value={String(d.maxItems ?? 6)} onValueChange={v => v && set('maxItems', Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[3, 4, 6, 8, 12].map(n => (
              <SelectItem key={n} value={String(n)}>{t('coursesCount', { count: n })}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          checked={!!d.showPrice}
          onCheckedChange={v => set('showPrice', v)}
          id="show-price"
        />
        <Label htmlFor="show-price">{t('showPrice')}</Label>
      </div>
      <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
        {t('autoPopulated')}
      </p>
    </div>
  )
}
