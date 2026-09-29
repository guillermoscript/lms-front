import { IconMessage } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

interface EmptyFeedProps {
  scope: 'school' | 'course'
  /** Replaces the default line, e.g. when a filter emptied the feed. */
  message?: string
}

export function EmptyFeed({ scope, message }: EmptyFeedProps) {
  const t = useTranslations('community')

  return (
    <div className="text-center py-16 border rounded-xl border-dashed bg-muted/30">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <IconMessage size={28} className="text-muted-foreground/50" />
      </div>
      <p className="font-semibold text-sm">
        {message ?? (scope === 'course' ? t('emptyCourse') : t('emptySchool'))}
      </p>
    </div>
  )
}
