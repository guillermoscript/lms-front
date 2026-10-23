import { useTranslations } from 'next-intl'
import { IconArrowDownRight, IconArrowUpRight, IconMinus } from '@tabler/icons-react'
import type { Delta } from '@/lib/admin/dashboard-metrics'
import { cn } from '@/lib/utils'

/** "▲ +12% vs previous 30 days": direction is an icon AND a signed number, never colour alone. */
export function DeltaText({ delta, className }: { delta: Delta; className?: string }) {
  const t = useTranslations('dashboard.admin.main.performance.delta')
  if (delta.kind === 'none') return null

  if (delta.kind === 'new') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
        {t('new')}
      </span>
    )
  }

  const { percent } = delta
  const Icon = percent > 0 ? IconArrowUpRight : percent < 0 ? IconArrowDownRight : IconMinus
  const value = `${percent > 0 ? '+' : ''}${percent}%`
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        percent > 0 && 'text-success',
        percent < 0 && 'text-destructive',
        percent === 0 && 'text-muted-foreground',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {t('change', { value })}
    </span>
  )
}
