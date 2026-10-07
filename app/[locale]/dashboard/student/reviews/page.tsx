import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getDueReviewCards } from '@lms/core'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import { ReviewSession } from '@/components/student/review-session'

/** Cards per session — the MCP review widget uses the same default. */
const SESSION_SIZE = 20

/**
 * Flashcard review session (#849): the due count on the dashboard and in the
 * daily digest leads here. `review_cards` is own-row under RLS, so the read
 * runs on the student's own token, never the admin client.
 */
export default async function StudentReviewsPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const [supabase, tenantId, t] = await Promise.all([
    createClient(),
    getCurrentTenantId(),
    getTranslations('dashboard.student.reviews'),
  ])

  const { data, count, error } = await getDueReviewCards(supabase, userId, tenantId, SESSION_SIZE)
  if (error) throw new Error(error.message)
  const cards = data ?? []

  return (
    <PageShell variant="reading" data-testid="reviews-page">
      <PageHeader title={t('title')} description={t('subtitle')} />

      {/* Keyed on the batch so "review more" (router.refresh) starts a fresh session. */}
      <ReviewSession
        key={cards.map((c) => c.id).join(',')}
        userId={userId}
        tenantId={tenantId}
        cards={cards.map(({ id, front, back }) => ({ id, front, back }))}
        totalDue={count ?? cards.length}
      />
    </PageShell>
  )
}
