'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { TextField, TextareaField } from './editor-field'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { LogoCloudSectionData, LogoCloudItem } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

export function LogoCloudEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.logoCloud')
  const d = data as unknown as LogoCloudSectionData

  function set(key: keyof LogoCloudSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  function updateItem(idx: number, field: keyof LogoCloudItem, value: string) {
    const items = [...(d.items || [])]
    items[idx] = { ...items[idx], [field]: value }
    set('items', items)
  }

  function addItem() {
    set('items', [...(d.items || []), { name: 'New Partner', logoUrl: '', href: '' }])
  }

  function removeItem(idx: number) {
    set('items', (d.items || []).filter((_: unknown, i: number) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} placeholder={t('titlePlaceholder')} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} placeholder={t('subtitlePlaceholder')} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('logos')}</p>
          <Button variant="outline" size="sm" onClick={addItem}>
            <IconPlus className="w-3.5 h-3.5 mr-1" /> {t('add')}
          </Button>
        </div>
        {d.items?.map((item, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t('logo', { index: idx + 1 })}</span>
              <button onClick={() => removeItem(idx)} className="text-destructive hover:text-destructive/80">
                <IconTrash className="w-3.5 h-3.5" />
              </button>
            </div>
            <TextField label={t('name')} value={item.name ?? ''} onChange={v => updateItem(idx, 'name', v)} placeholder={t('namePlaceholder')} />
            <TextField label={t('logoUrl')} value={item.logoUrl ?? ''} onChange={v => updateItem(idx, 'logoUrl', v)} placeholder="https://..." />
            <TextField label={t('link')} value={item.href ?? ''} onChange={v => updateItem(idx, 'href', v)} placeholder="https://..." />
          </div>
        ))}
      </div>
    </div>
  )
}
