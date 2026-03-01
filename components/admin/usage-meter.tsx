'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface UsageMeterProps {
  label: string
  current: number
  limit: number // -1 means unlimited
  className?: string
}

export function UsageMeter({ label, current, limit, className }: UsageMeterProps) {
  const isUnlimited = limit === -1
  const percentage = isUnlimited ? 0 : Math.min(100, (current / limit) * 100)
  const isWarning = !isUnlimited && percentage >= 80
  const isAtLimit = !isUnlimited && current >= limit

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(
          'font-medium',
          isAtLimit && 'text-destructive',
          isWarning && !isAtLimit && 'text-yellow-600 dark:text-yellow-500'
        )}>
          {current} / {isUnlimited ? '∞' : limit}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          className={cn(
            'h-2',
            isAtLimit && '[&>div]:bg-destructive',
            isWarning && !isAtLimit && '[&>div]:bg-yellow-500'
          )}
        />
      )}
      {isUnlimited && (
        <div className="h-2 rounded-full bg-muted">
          <div className="h-full w-full rounded-full bg-green-500/30" />
        </div>
      )}
    </div>
  )
}
