'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { HeroSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function HeroEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.hero')
  const d = data as unknown as HeroSectionData

  function set(key: keyof HeroSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} placeholder={t('titlePlaceholder')} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} placeholder={t('subtitlePlaceholder')} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label={t('primaryCtaText')} value={d.ctaText ?? ''} onChange={v => set('ctaText', v)} placeholder="Browse Courses" />
        <TextField label={t('primaryCtaLink')} value={d.ctaLink ?? ''} onChange={v => set('ctaLink', v)} placeholder="/courses" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextField label={t('secondaryCtaText')} value={d.secondaryCtaText ?? ''} onChange={v => set('secondaryCtaText', v)} placeholder="Learn More" />
        <TextField label={t('secondaryCtaLink')} value={d.secondaryCtaLink ?? ''} onChange={v => set('secondaryCtaLink', v)} placeholder="/about" />
      </div>
      <TextField label={t('backgroundImage')} value={d.backgroundImage ?? ''} onChange={v => set('backgroundImage', v)} placeholder="https://..." />
      <div className="space-y-1.5">
        <Label>{t('alignment')}</Label>
        <Select value={d.alignment ?? 'center'} onValueChange={v => v && set('alignment', v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">{t('left')}</SelectItem>
            <SelectItem value="center">{t('center')}</SelectItem>
            <SelectItem value="right">{t('right')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
