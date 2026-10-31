import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, PageShell } from '@/components/dashboard/page-shell'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
      {!enabled && <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">{t('disabled')}</p>}
      {enabled && !aiGrading && <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">{t('noPlan')}</p>}
      {rows.length === 0 ? (
        <p data-testid="challenges-empty" className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table className="min-w-[56rem] text-sm" data-testid="challenges-table">
              <TableHeader>
                <TableRow>
                  {(['colExercise', 'colCourse', 'colCreators', 'colCreated', 'colLinks', 'colPlays', 'colPlayers', 'colAvg', 'colTop', 'colClaimed'] as const).map((k) => (
                    <TableHead key={k} scope="col">{t(k)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.exerciseId} data-testid="challenge-row">
                    <TableHead scope="row" className="font-medium text-foreground">
                      <Link className="underline-offset-2 hover:underline" href={`/dashboard/teacher/challenges/${r.exerciseId}`}>{r.title}</Link>
                    </TableHead>
                    <TableCell>{r.courseTitle}</TableCell>
                    <TableCell>{r.creators.join(', ') || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.firstLinkAt ? date.format(new Date(r.firstLinkAt)) : t('noLink')}</TableCell>
                    <TableCell>
                      <Badge variant={r.activeLinks ? 'default' : 'secondary'}>{t('linksValue', { active: r.activeLinks, revoked: r.revokedLinks })}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{r.plays} <span className="text-xs text-muted-foreground">({t('official', { count: r.officialPlays })})</span></TableCell>
                    <TableCell className="tabular-nums">{r.uniquePlayers}</TableCell>
                    <TableCell className="tabular-nums">{r.avgScore ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{r.topScore ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{r.claimedGuests}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">{t('playsHint')}</p>
        </>
      )}
    </PageShell>
  )
}
