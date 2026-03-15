import { IconMoodSmile } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'

interface MutedBannerProps {
  mutedUntil?: string | null
}

export function MutedBanner({ mutedUntil }: MutedBannerProps) {
  const t = useTranslations('community')

  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <IconMoodSmile size={20} className="text-destructive shrink-0" />
      <div>
        <p className="font-medium text-destructive">{t('muted')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {mutedUntil
            ? t('mutedUntil', { date: format(new Date(mutedUntil), 'PPP') })
            : t('mutedIndefinite')}
        </p>
      </div>
    </div>
  )
}
