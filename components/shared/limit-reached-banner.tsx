'use client'

import { Button } from '@/components/ui/button'
import { IconAlertTriangle, IconX } from '@tabler/icons-react'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface LimitReachedBannerProps {
  resource: string       // "courses" | "students"
  current: number
  limit: number          // -1 = unlimited
  className?: string
}

export function LimitReachedBanner({ resource, current, limit, className }: LimitReachedBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || limit === -1) return null

  const percentage = (current / limit) * 100
  const isAtLimit = current >= limit
  const isApproaching = percentage >= 80

  if (!isApproaching) return null

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-md border px-4 py-3',
      isAtLimit
        ? 'border-destructive/50 bg-destructive/10 text-destructive'
        : 'border-yellow-500/50 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-200',
      className
    )}>
      <IconAlertTriangle className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-sm">
        {isAtLimit
          ? `You've reached your ${resource} limit (${limit}). Upgrade your plan to add more.`
          : `You're using ${current} of ${limit} ${resource}. Consider upgrading for more capacity.`
        }
      </p>
      <Link href="/dashboard/admin/billing/upgrade">
        <Button variant={isAtLimit ? 'destructive' : 'outline'} size="sm">
          Upgrade
        </Button>
      </Link>
      {!isAtLimit && (
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <IconX className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
