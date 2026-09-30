import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconCards, IconArrowRight } from '@tabler/icons-react'
import { getDueReviewCount } from '@lms/core'
import { createClient } from '@/lib/supabase/server'

/**
 * "N cards due" on the student dashboard, linking to the review session (#849).
 * Same count the daily digest is sent about, on the student's own token
 * (`review_cards` is own-row under RLS). Renders nothing with no card due —
 * and on a failed count, since the surface is optional.
 */
export async function DueReviewsBanner({ userId, tenantId }: { userId: string; tenantId: string }) {
  const supabase = await createClient()
  const { count, error } = await getDueReviewCount(supabase, userId, tenantId)
  if (error || !count) return null

  const t = await getTranslations('dashboard.student.reviews')
  return (
    <Link
      href="/dashboard/student/reviews"
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-primary/40 transition-colors"
      data-testid="due-reviews-banner"
    >
      <div className="p-2 rounded-lg bg-brand-tint text-brand-text shrink-0">
        <IconCards size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t('dueCount', { count })}</p>
        <p className="text-xs text-muted-foreground">{t('dueHint')}</p>
      </div>
      <span className="text-sm font-medium text-brand-text flex items-center gap-1 shrink-0">
        {t('start')}
        <IconArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
