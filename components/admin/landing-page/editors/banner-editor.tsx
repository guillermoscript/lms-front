'use client'

import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TextField } from './editor-field'
import type { BannerSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function BannerEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.banner')
  const d = data as unknown as BannerSectionData

  function set(key: keyof BannerSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <TextField label={t('text')} value={d.text ?? ''} onChange={v => set('text', v)} placeholder={t('textPlaceholder')} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label={t('ctaText')} value={d.ctaText ?? ''} onChange={v => set('ctaText', v)} placeholder="Learn More" />
        <TextField label={t('ctaLink')} value={d.ctaLink ?? ''} onChange={v => set('ctaLink', v)} placeholder="/courses" />
      </div>
      <div className="space-y-1.5">
        <Label>{t('style')}</Label>
        <Select value={d.style ?? 'info'} onValueChange={v => v && set('style', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="info">{t('info')}</SelectItem>
            <SelectItem value="warning">{t('warning')}</SelectItem>
            <SelectItem value="urgent">{t('urgent')}</SelectItem>
            <SelectItem value="celebration">{t('celebration')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <TextField
        label={t('countdownDate')}
        value={d.countdownDate ?? ''}
        onChange={v => set('countdownDate', v)}
        placeholder={t('countdownPlaceholder')}
        hint={t('countdownHint')}
      />
    </div>
  )
}
