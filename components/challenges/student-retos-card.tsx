import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { RetoCard } from '@/components/challenges/shared/reto-card'
import { loadChallengesEnabled } from '@/lib/challenges/links'
import { loadStudentRetos, type StudentReto } from '@/lib/challenges/student'
import { createAdminClient } from '@/lib/supabase/admin'

export const HOME_RETOS_LIMIT = 3

/** Items the home card shows: first {@link HOME_RETOS_LIMIT} of the already-ordered retos. */
export function homeRetos(retos: StudentReto[]): StudentReto[] {
  return retos.slice(0, HOME_RETOS_LIMIT)
}

/** Student home "Your challenges" card. Renders nothing when the feature is off or there is nothing to show. */
export async function StudentRetosCard({ tenantId, userId }: { tenantId: string; userId: string }) {
  const admin = createAdminClient()
  if (!(await loadChallengesEnabled(admin, tenantId))) return null
  let retos: StudentReto[]
  try {
    retos = homeRetos(await loadStudentRetos(tenantId, userId, admin))
  } catch (err) {
    // A side card must never take the dashboard down.
    console.error('StudentRetosCard failed', err)
    return null
  }
  if (!retos.length) return null
  const [t, tc] = await Promise.all([getTranslations('challenges.student'), getTranslations('common')])
  return (
    <section aria-labelledby="home-retos" className="space-y-3" data-testid="home-retos">
      <div className="flex items-center justify-between">
        <h2 id="home-retos" className="text-lg font-bold">{t('homeTitle')}</h2>
        <Link href="/dashboard/student/challenges" className="text-sm font-medium text-brand-text hover:underline">{tc('viewAll')}</Link>
      </div>
      <div className="flex flex-col gap-3">
        {retos.map((r) => (
          <RetoCard
            key={r.exerciseId}
            testId="home-reto"
            title={r.title}
            subtitle={r.courseTitle}
            stats={[
              { label: t('position'), value: r.myRank ? t('positionValue', { rank: r.myRank, total: r.totalPlayers }) : '—' },
              { label: t('myScore'), value: r.myScore ?? '—' },
              { label: t('friendPlays'), value: r.friendPlays },
            ]}
          />
        ))}
      </div>
    </section>
  )
}
