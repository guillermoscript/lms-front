'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CtaSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function CtaEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.cta')
  const d = data as unknown as CtaSectionData

  function set(key: keyof CtaSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} rows={2} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label={t('ctaText')} value={d.ctaText ?? ''} onChange={v => set('ctaText', v)} placeholder="Get Started" />
        <TextField label={t('ctaLink')} value={d.ctaLink ?? ''} onChange={v => set('ctaLink', v)} placeholder="/courses" />
      </div>
      <div className="space-y-1.5">
        <Label>{t('style')}</Label>
        <Select value={d.style ?? 'gradient'} onValueChange={v => v && set('style', v)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gradient">{t('gradient')}</SelectItem>
            <SelectItem value="solid">{t('solid')}</SelectItem>
            <SelectItem value="outline">{t('outline')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
