'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface UsageMeterProps {
  label: string
  current: number
  limit: number // -1 means unlimited
  className?: string
}

export function UsageMeter({ label, current, limit, className }: UsageMeterProps) {
  const t = useTranslations('dashboard.admin.billing.overview')
  const isUnlimited = limit === -1
  const percentage = isUnlimited ? 0 : Math.min(100, (current / limit) * 100)
  const isWarning = !isUnlimited && percentage >= 80
  const isAtLimit = !isUnlimited && current >= limit
  const roundedPercentage = Math.round(percentage)

  return (
    <div className={cn('min-w-0 space-y-2.5', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className={cn(
          'shrink-0 font-medium tabular-nums',
          isAtLimit && 'text-destructive',
          isWarning && !isAtLimit && 'text-yellow-600 dark:text-yellow-500'
        )}>
          {current} / {isUnlimited ? '∞' : limit.toLocaleString()}
        </span>
      </div>
      {!isUnlimited && (
        <>
          <Progress
            value={percentage}
            aria-label={`${label}: ${t('usagePercent', { percent: roundedPercentage })}`}
            className={cn(
              'h-2',
              isAtLimit && '[&>div]:bg-destructive',
              isWarning && !isAtLimit && '[&>div]:bg-yellow-500'
            )}
          />
          <p className={cn(
            'text-xs text-muted-foreground',
            isAtLimit && 'text-destructive',
            isWarning && !isAtLimit && 'text-yellow-700 dark:text-yellow-400',
          )}>
            {isAtLimit ? t('limitReached') : t('usagePercent', { percent: roundedPercentage })}
          </p>
        </>
      )}
      {isUnlimited && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {t('unlimitedPlan')}
        </div>
      )}
    </div>
  )
}
