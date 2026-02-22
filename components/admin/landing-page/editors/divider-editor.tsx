'use client'

import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DividerSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function DividerEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.divider')
  const d = data as unknown as DividerSectionData

  function set(key: keyof DividerSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t('style')}</Label>
        <Select value={d.style ?? 'line'} onValueChange={v => v && set('style', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="line">{t('line')}</SelectItem>
            <SelectItem value="space">{t('space')}</SelectItem>
            <SelectItem value="dots">{t('dots')}</SelectItem>
            <SelectItem value="gradient">{t('gradient')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t('height')}</Label>
        <Select value={d.height ?? 'md'} onValueChange={v => v && set('height', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">{t('small')}</SelectItem>
            <SelectItem value="md">{t('medium')}</SelectItem>
            <SelectItem value="lg">{t('large')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
