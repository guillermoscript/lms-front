import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconPlus } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

export async function DashboardHeader({
  firstName,
  schoolName,
}: {
  firstName: string | null
  schoolName: string | null
}) {
  const t = await getTranslations('dashboard.admin.main.header')
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {firstName ? t('title', { name: firstName }) : t('titleFallback')}
        </h1>
        {schoolName && <p className="mt-1 truncate text-sm text-muted-foreground">{schoolName}</p>}
      </div>
      <Button render={<Link href="/dashboard/admin/courses/new" />} className="gap-1.5">
        <IconPlus aria-hidden />
        {t('newCourse')}
      </Button>
    </header>
  )
}
