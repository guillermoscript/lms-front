import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconArrowRight } from '@tabler/icons-react'

export async function DraftsNudge({ count }: { count: number }) {
  if (count <= 0) return null
  const t = await getTranslations('dashboard.admin.main.drafts')
  return (
    <Link
      href="/dashboard/admin/courses"
      data-testid="admin-drafts-nudge"
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
    >
      <span>{t('waiting', { count })}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-text">
        {t('action')}
        <IconArrowRight aria-hidden className="size-3.5" />
      </span>
    </Link>
  )
}
