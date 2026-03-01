'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TextField, TextareaField } from './editor-field'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { ContactSectionData, SocialLink, SocialPlatform } from '@/lib/landing-pages/types'

interface Props {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

const PLATFORMS: SocialPlatform[] = ['twitter', 'facebook', 'instagram', 'youtube', 'linkedin', 'tiktok', 'github']

export function ContactEditor({ data, onChange }: Props) {
  const t = useTranslations('landingPageBuilder.editor.contact')
  const d = data as unknown as ContactSectionData

  function set(key: keyof ContactSectionData, value: unknown) {
    onChange({ ...data, [key]: value })
  }

  function updateSocialLink(idx: number, field: keyof SocialLink, value: string) {
    const links = [...(d.socialLinks || [])]
    links[idx] = { ...links[idx], [field]: value }
    set('socialLinks', links)
  }

  function addSocialLink() {
    set('socialLinks', [...(d.socialLinks || []), { platform: 'twitter' as SocialPlatform, url: '' }])
  }

  function removeSocialLink(idx: number) {
    set('socialLinks', (d.socialLinks || []).filter((_: unknown, i: number) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <TextField label={t('title')} value={d.title ?? ''} onChange={v => set('title', v)} placeholder={t('titlePlaceholder')} />
      <TextareaField label={t('subtitle')} value={d.subtitle ?? ''} onChange={v => set('subtitle', v)} placeholder={t('subtitlePlaceholder')} />
      <TextField label={t('email')} value={d.email ?? ''} onChange={v => set('email', v)} placeholder={t('emailPlaceholder')} />

      <div className="flex items-center justify-between">
        <Label>{t('showForm')}</Label>
        <Switch checked={d.showForm ?? false} onCheckedChange={v => set('showForm', v)} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('socialLinks')}</p>
          <Button variant="outline" size="sm" onClick={addSocialLink}>
            <IconPlus className="w-3.5 h-3.5 mr-1" /> {t('add')}
          </Button>
        </div>
        {d.socialLinks?.map((link, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5 flex-1 mr-2">
                <Label>{t('platform')}</Label>
                <Select value={link.platform} onValueChange={v => v && updateSocialLink(idx, 'platform', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button onClick={() => removeSocialLink(idx)} className="text-destructive hover:text-destructive/80 mt-5">
                <IconTrash className="w-3.5 h-3.5" />
              </button>
            </div>
            <TextField label={t('url')} value={link.url ?? ''} onChange={v => updateSocialLink(idx, 'url', v)} placeholder="https://..." />
          </div>
        ))}
      </div>
    </div>
  )
}
