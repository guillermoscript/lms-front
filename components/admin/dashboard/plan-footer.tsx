import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconArrowUpRight } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UsageMeter } from '@/components/admin/usage-meter'
import { isUnlimited } from '@/lib/admin/dashboard-metrics'

/**
 * Thin plan strip at the bottom of the page. Unlimited limits collapse to one
 * line; meters appear only where a limit exists; the upgrade button only when
 * billing applies and the school is on Free or near a limit.
 */
export async function PlanFooter({
  planName,
  planSlug,
  courses,
  students,
  maxCourses,
  maxStudents,
  lifecycleApplies,
}: {
  planName: string
  planSlug: string
  courses: number
  students: number
  maxCourses: number | null | undefined
  maxStudents: number | null | undefined
  lifecycleApplies: boolean
}) {
  const t = await getTranslations('dashboard.admin.main')
  const meters = [
    { label: t('plan.courses'), current: courses, limit: maxCourses },
    { label: t('plan.students'), current: students, limit: maxStudents },
  ].filter((m): m is { label: string; current: number; limit: number } => !isUnlimited(m.limit))

  const nearLimit = meters.some((m) => m.current / m.limit >= 0.8)
  const showUpgrade = lifecycleApplies && (planSlug === 'free' || nearLimit)

  return (
    <footer
      data-tour="admin-plan"
      data-testid="admin-plan-footer"
      className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {meters.length === 0 ? (
          <span className="font-medium">{t('planFooter.unlimited', { plan: planName })}</span>
        ) : (
          <>
            <span className="font-medium">
              {planName} {t('plan.label')}
            </span>
            <Badge variant={planSlug === 'free' ? 'secondary' : 'default'} className="uppercase tracking-wider">
              {planSlug === 'free' ? t('plan.current') : t('plan.active')}
            </Badge>
          </>
        )}
      </div>
      {meters.length > 0 && (
        <div className="flex flex-1 items-center gap-6 sm:max-w-sm">
          {meters.map((m) => (
            <UsageMeter key={m.label} className="flex-1" label={m.label} current={m.current} limit={m.limit} />
          ))}
        </div>
      )}
      {showUpgrade && (
        <Button
          variant={planSlug === 'free' ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5 self-start sm:self-auto"
          render={<Link href="/dashboard/admin/billing/upgrade" />}
        >
          {planSlug === 'free' ? t('plan.upgrade') : t('plan.changePlan')}
          <IconArrowUpRight aria-hidden />
        </Button>
      )}
    </footer>
  )
}
