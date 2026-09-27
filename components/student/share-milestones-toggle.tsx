'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconMessages } from '@tabler/icons-react'
import { Switch } from '@/components/ui/switch'
import { updateShareMilestones } from '@/app/[locale]/dashboard/student/profile/actions'

interface ShareMilestonesToggleProps {
  /** `profiles.share_milestones`, read in the page. */
  initialEnabled: boolean
  /** This school's `community_milestone_posts` switch. Off: the preference
   *  still applies in the student's other schools; the toggle says so. */
  schoolSharing: boolean
}

// "Share my milestones in the community" (#871). The database announces a
// finished course, a certificate, level 5+ and 7/30/100-day streaks; this is
// the student's way to stop that. `id` is the target of the "Sharing settings"
// link in a milestone post's menu.
export function ShareMilestonesToggle({ initialEnabled, schoolSharing }: ShareMilestonesToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isSaving, setIsSaving] = useState(false)
  const t = useTranslations('community.milestones.share')

  const handleChange = async (checked: boolean) => {
    setIsSaving(true)
    setEnabled(checked)
    try {
      const result = await updateShareMilestones(checked)
      if (!result.success) throw new Error(result.code)
      toast.success(checked ? t('enabledToast') : t('disabledToast'))
    } catch {
      setEnabled(!checked)
      toast.error(t('error'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      id="share-milestones"
      data-testid="share-milestones-toggle"
      className="flex scroll-mt-24 items-center justify-between gap-4 rounded-xl border border-border p-4"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-1.5 rounded-lg bg-muted/50 shrink-0">
          <IconMessages size={18} className="text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('label')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('description')}</p>
          {!schoolSharing && (
            <p className="text-xs text-muted-foreground mt-1">{t('schoolOff')}</p>
          )}
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleChange}
        disabled={isSaving}
        aria-label={t('label')}
      />
    </div>
  )
}
