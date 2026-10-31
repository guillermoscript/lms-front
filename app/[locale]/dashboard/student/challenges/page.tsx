import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader, PageShell } from '@/components/dashboard/page-shell'
import { ChallengeLinksList } from '@/components/challenges/challenge-links-list'
import { RetoCard } from '@/components/challenges/shared/reto-card'
import { RetoLeaderboard } from '@/components/challenges/shared/reto-leaderboard'
import { loadStudentRetos } from '@/lib/challenges/student'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

// proxy.ts keeps non-students out of /dashboard/student; staff use /dashboard/teacher/challenges.
export default async function StudentRetosPage() {
  const [role, userId, tenantId, t, tl] = await Promise.all([
    getUserRole(), getCurrentUserId(), getCurrentTenantId(),
    getTranslations('challenges.student'), getTranslations('challenges.admin.links'),
  ])
  if (role !== 'student') redirect('/dashboard')
  if (!userId) redirect('/auth/login')
  const retos = await loadStudentRetos(tenantId, userId)

  return (
    <PageShell variant="reading">
      <PageHeader title={t('title')} description={t('description')} />
      {retos.length === 0 ? (
        <p data-testid="student-retos-empty" className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="space-y-4">
          {retos.map((r) => (
            <RetoCard
              key={r.exerciseId}
              testId="student-reto"
              title={r.title}
              subtitle={r.courseTitle}
              stats={[
                { label: t('position'), value: r.myRank ? t('positionValue', { rank: r.myRank, total: r.totalPlayers }) : '—' },
                { label: t('myScore'), value: r.myScore ?? '—' },
                { label: t('myPlays'), value: r.myPlays },
                { label: t('friendPlays'), value: r.friendPlays },
              ]}
            >
              {r.joined.length > 0 && (
                <p className="text-sm">
                  <span className="text-muted-foreground">{t('joined')}: </span>
                  {r.joined.map((j) => j === null ? t('guest') : j || t('student')).join(', ')}
                </p>
              )}
              <RetoLeaderboard entries={r.leaderboard} testId="student-reto-leaderboard" />
            </RetoCard>
          ))}
        </div>
      )}
      <section aria-labelledby="my-links" className="space-y-3 border-t pt-6">
        <h2 id="my-links" className="text-base font-semibold">{tl('title')}</h2>
        <ChallengeLinksList />
      </section>
    </PageShell>
  )
}
