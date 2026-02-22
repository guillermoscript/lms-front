'use client'

import { useTranslations } from 'next-intl'
import { TextField, TextareaField } from './editor-field'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { PricingSectionData } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function PricingEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.pricing')
  const d = data as unknown as PricingSectionData

  function set(key: keyof PricingSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} rows={2} />
      <div className="flex items-center gap-3">
        <Switch
          checked={!!d.showProducts}
          onCheckedChange={v => set('showProducts', v)}
          id="show-products"
        />
        <Label htmlFor="show-products">{t('autoLoadProducts')}</Label>
      </div>
      <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
        {t('autoLoadHint')}
      </p>
    </div>
  )
}
