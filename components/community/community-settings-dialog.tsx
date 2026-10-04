'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { IconSettings } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateCommunitySettings } from '@/app/actions/admin/community'
import type { CommunitySettings } from '@/lib/community/settings'
import { COMMUNITY_SETTING_KEYS, type CommunitySettingKey } from '@/lib/community/setting-keys'

// The field doubles as the i18n label key (`<field>` + `<field>Desc`).
const SWITCHES = (['studentPostsSchoolFeed', 'studentPolls', 'milestonePosts'] as const).map((field) => ({
  field,
  key: COMMUNITY_SETTING_KEYS[field],
}))

/** Admin switches for the school's community (#860, #871). Saves on toggle. */
export function CommunitySettingsDialog({ settings }: { settings: CommunitySettings }) {
  const t = useTranslations('community.settings')
  const router = useRouter()
  const [values, setValues] = useState(settings)
  const [pending, setPending] = useState<string | null>(null)

  async function toggle(field: keyof CommunitySettings, key: CommunitySettingKey, enabled: boolean) {
    setPending(key)
    setValues((prev) => ({ ...prev, [field]: enabled }))
    const result = await updateCommunitySettings({ [key]: enabled })
    setPending(null)
    if (result.success) {
      toast.success(t('saved'))
      router.refresh()
    } else {
      setValues((prev) => ({ ...prev, [field]: !enabled }))
      toast.error(result.error)
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <IconSettings className="h-4 w-4" />
        {t('open')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {SWITCHES.map(({ field, key }) => (
            <div key={key} className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor={key}>{t(field)}</Label>
                <p className="text-xs text-muted-foreground">{t(`${field}Desc`)}</p>
              </div>
              <Switch
                id={key}
                checked={values[field]}
                disabled={pending !== null}
                onCheckedChange={(checked) => toggle(field, key, checked)}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
