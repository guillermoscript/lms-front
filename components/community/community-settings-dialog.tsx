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

const SWITCHES = [
  { field: 'studentPostsSchoolFeed', key: 'community_student_posts_school_feed', label: 'studentPostsSchoolFeed' },
  { field: 'studentPolls', key: 'community_student_polls', label: 'studentPolls' },
] as const

/** Admin switches for what students may do in the community (#860). Saves on toggle. */
export function CommunitySettingsDialog({ settings }: { settings: CommunitySettings }) {
  const t = useTranslations('community.settings')
  const router = useRouter()
  const [values, setValues] = useState(settings)
  const [pending, setPending] = useState<string | null>(null)

  async function toggle(field: keyof CommunitySettings, key: string, enabled: boolean) {
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
          {SWITCHES.map(({ field, key, label }) => (
            <div key={key} className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor={key}>{t(label)}</Label>
                <p className="text-xs text-muted-foreground">{t(`${label}Desc`)}</p>
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
