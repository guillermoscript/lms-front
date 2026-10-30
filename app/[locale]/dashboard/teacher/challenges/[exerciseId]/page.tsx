import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, PageShell } from '@/components/dashboard/page-shell'
import { Badge } from '@/components/ui/badge'
import { StaffAttemptList } from '@/components/challenges/staff-attempt-list'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { leaderboardOf, loadExerciseChallengePlays } from '@/lib/challenges/staff'

interface PageProps { params: Promise<{ exerciseId: string }> }

/** One exercise's challenge: links, leaderboard and every play. Course author or admin only. */
export default async function StaffChallengeDetailPage({ params }: PageProps) {
  const { exerciseId: raw } = await params
  const exerciseId = Number.parseInt(raw, 10)
  if (!Number.isInteger(exerciseId)) return notFound()
  const [role, userId, tenantId, t, locale] = await Promise.all([
    getUserRole(), getCurrentUserId(), getCurrentTenantId(), getTranslations('challenges.staff'), getLocale(),
  ])
  if (!userId) redirect('/auth/login')
  if (role !== 'teacher' && role !== 'admin') redirect('/dashboard/student')

  const admin = createAdminClient()
  const { data: exercise } = await admin.from('exercises').select('id, title, course_id').eq('id', exerciseId).eq('tenant_id', tenantId).maybeSingle()
  if (!exercise) return notFound()
  const { data: course } = await admin.from('courses').select('author_id').eq('course_id', exercise.course_id).eq('tenant_id', tenantId).maybeSingle()
  if (!course || (role !== 'admin' && course.author_id !== userId)) return notFound()

  const { attempts, links } = await loadExerciseChallengePlays(tenantId, exercise.id, admin)
  const board = leaderboardOf(attempts)
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })

  return (
    <PageShell variant="reading">
      <PageHeader back={{ href: '/dashboard/teacher/challenges', label: t('back') }} title={t('detailTitle', { title: exercise.title })} />

      <section aria-labelledby="ch-links" className="space-y-2">
        <h2 id="ch-links" className="text-base font-semibold">{t('linksTitle')}</h2>
        {links.length === 0 ? <p className="text-sm text-muted-foreground">{t('linksEmpty')}</p> : (
          <ul className="divide-y rounded-lg border">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Badge variant={l.active ? 'default' : 'secondary'}>{l.active ? t('linkActive') : t('linkRevoked')}</Badge>
                <a className="underline underline-offset-2" href={l.path} target="_blank" rel="noreferrer">{l.path}</a>
                <span className="text-muted-foreground">{fmt.format(new Date(l.createdAt))} · {t('linkBy', { name: l.creatorName ?? t('unknownCreator') })}</span>
                <span className="ml-auto tabular-nums">{t('linkPlays', { count: l.plays })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ch-board" className="space-y-2">
        <h2 id="ch-board" className="text-base font-semibold">{t('leaderboard')}</h2>
        {board.length === 0 ? <p className="text-sm text-muted-foreground">{t('leaderboardEmpty')}</p> : (
          <ol className="divide-y rounded-lg border" data-testid="challenge-leaderboard">
            {board.map((a, i) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-6 tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="font-medium">{a.playerName ?? (a.isGuest ? t('guest') : t('member'))}</span>
                {a.isGuest && <Badge variant="outline">{t('guest')}</Badge>}
                <span className="ml-auto font-semibold tabular-nums">{a.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="ch-attempts" className="space-y-2">
        <h2 id="ch-attempts" className="text-base font-semibold">{t('attemptsTitle')}</h2>
        <StaffAttemptList attempts={attempts} locale={locale} limited={attempts.length === 500} />
      </section>
    </PageShell>
  )
}
