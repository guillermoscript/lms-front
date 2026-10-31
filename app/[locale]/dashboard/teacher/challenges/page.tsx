import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, PageShell } from '@/components/dashboard/page-shell'
import { Badge } from '@/components/ui/badge'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPlanFeature } from '@/lib/plans/server'
import { loadChallengesEnabled } from '@/lib/challenges/links'
import { loadChallengeOverview } from '@/lib/challenges/staff'

/** Staff overview of every exercise challenge: admin sees the whole school, a teacher their own courses. */
export default async function StaffChallengesPage() {
  const [role, userId, tenantId, t, locale] = await Promise.all([
    getUserRole(), getCurrentUserId(), getCurrentTenantId(), getTranslations('challenges.staff'), getLocale(),
  ])
  if (!userId) redirect('/auth/login')
  if (role !== 'teacher' && role !== 'admin') redirect('/dashboard/student')

  const admin = createAdminClient()
  const [rows, enabled, aiGrading] = await Promise.all([
    loadChallengeOverview({ tenantId, userId, role }, admin),
    loadChallengesEnabled(admin, tenantId),
    hasPlanFeature(tenantId, 'ai_grading'),
  ])
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })

  return (
    <PageShell variant="default">
      <PageHeader title={t('title')} description={t('description')} />
      {!enabled && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{t('disabled')}</p>}
      {enabled && !aiGrading && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{t('noPlan')}</p>}
      {rows.length === 0 ? (
        <p data-testid="challenges-empty" className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[56rem] text-sm" data-testid="challenges-table">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  {(['colExercise', 'colCourse', 'colCreators', 'colCreated', 'colLinks', 'colPlays', 'colPlayers', 'colAvg', 'colTop', 'colClaimed'] as const).map((k) => (
                    <th key={k} scope="col" className="px-3 py-2 font-medium">{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.exerciseId} data-testid="challenge-row">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      <Link className="underline-offset-2 hover:underline" href={`/dashboard/teacher/challenges/${r.exerciseId}`}>{r.title}</Link>
                    </th>
                    <td className="px-3 py-2">{r.courseTitle}</td>
                    <td className="px-3 py-2">{r.creators.join(', ') || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.firstLinkAt ? date.format(new Date(r.firstLinkAt)) : t('noLink')}</td>
                    <td className="px-3 py-2">
                      <Badge variant={r.activeLinks ? 'default' : 'secondary'}>{t('linksValue', { active: r.activeLinks, revoked: r.revokedLinks })}</Badge>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.plays} <span className="text-xs text-muted-foreground">({t('official', { count: r.officialPlays })})</span></td>
                    <td className="px-3 py-2 tabular-nums">{r.uniquePlayers}</td>
                    <td className="px-3 py-2 tabular-nums">{r.avgScore ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{r.topScore ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{r.claimedGuests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t('playsHint')}</p>
        </>
      )}
    </PageShell>
  )
}
