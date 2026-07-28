import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  IconArrowLeft,
  IconAlertTriangle,
  IconChartBar,
  IconFlame,
  IconScale,
  IconInfoCircle,
} from '@tabler/icons-react'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getConfusionHotspots, type Hotspot } from '@/lib/analytics/confusion-hotspots'
import { HotspotScopeBadge, SeverityBar, DifficultyDelta } from '@/components/teacher/analytics-cells'

interface PageProps {
  params: Promise<{ courseId: string; locale: string }>
  searchParams: Promise<{ days?: string }>
}

/** Look-back windows offered in the header. Anything else falls back to 30. */
const WINDOWS = [7, 30, 90] as const
const DEFAULT_WINDOW = 30

function parseWindow(raw: string | undefined): number {
  const n = Number(raw)
  return WINDOWS.includes(n as (typeof WINDOWS)[number]) ? n : DEFAULT_WINDOW
}

/**
 * Deep-link a hotspot back to the thing a teacher would edit. Practice topics
 * and exam questions have no standalone editor, so they link to the lesson or
 * stay inert rather than pointing somewhere that 404s.
 */
function hotspotHref(courseId: string, h: Hotspot): string | null {
  if (h.scope === 'exercise' && typeof h.ref === 'number') {
    return `/dashboard/teacher/courses/${courseId}/exercises/${h.ref}`
  }
  if (h.lessonId != null) {
    return `/dashboard/teacher/courses/${courseId}/lessons/${h.lessonId}`
  }
  return null
}

/**
 * The one-line "why this is a hotspot" under each item.
 *
 * Built here rather than in the analytics module so it can be translated: each
 * signal counts something different, so each gets its own message instead of a
 * generic one that would read wrong for three scopes out of four.
 */
function hotspotEvidence(h: Hotspot, t: Awaited<ReturnType<typeof getTranslations>>): string {
  if (h.scope === 'practice') {
    return t('hotspots.evidencePractice', {
      attempts: h.totalAttempts ?? 0,
      students: h.studentsAttempted,
      avg: h.avgScore ?? 0,
      below: h.studentsAffected,
    })
  }
  if (h.scope === 'exam_question') {
    return t('hotspots.evidenceExam', {
      missers: h.studentsAffected,
      students: h.studentsAttempted,
      rate: Math.round((h.studentsAffected / Math.max(h.studentsAttempted, 1)) * 100),
    })
  }
  // Exercises and checkpoints share a shape: latest attempt decides "stuck".
  const base = t('hotspots.evidenceStuck', {
    stuck: h.studentsAffected,
    students: h.studentsAttempted,
    attempts: (h.avgAttempts ?? 0).toFixed(1),
  })
  return h.avgScore == null ? base : `${base} · ${t('hotspots.evidenceAvg', { avg: h.avgScore })}`
}

export default async function CourseAnalyticsPage({ params, searchParams }: PageProps) {
  const { courseId } = await params
  const { days: daysParam } = await searchParams
  const days = parseWindow(daysParam)

  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.analytics')
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const courseIdNum = parseInt(courseId, 10)
  const { data: course } = await supabase
    .from('courses')
    .select('course_id, title, author_id')
    .eq('course_id', courseIdNum)
    .eq('tenant_id', tenantId)
    .single()

  // Same ownership rule the rest of the teacher course area uses: analytics
  // expose every student's results, so a non-author teacher must not see them.
  if (!course || course.author_id !== userId) {
    return (
      <div className="p-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>{t('accessDenied')}</CardTitle>
            <CardDescription>{t('accessDeniedDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/teacher/courses">
              <Button variant="outline">{t('backToCourses')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const result = await getConfusionHotspots(supabase, {
    courseId: courseIdNum,
    tenantId,
    days,
  })

  const { hotspots, hardestItems, sources, warnings } = result
  const mislabeled = hardestItems.filter((i) => i.mismatch !== null)
  const totalSignals =
    sources.practiceAttempts +
    sources.exerciseEvaluations +
    sources.checkpointAttempts +
    sources.examSubmissions

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <Link href={`/dashboard/teacher/courses/${courseId}`} className="shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('backToCourse')}>
                    <IconArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <h1 className="truncate text-2xl font-bold tracking-tight">{t('title')}</h1>
              </div>
              <p className="ml-10 text-sm text-muted-foreground">
                {t('subtitle', { course: course.title })}
              </p>
            </div>

            {/* Look-back window. Plain links keep the page fully server-rendered. */}
            <nav aria-label={t('windowLabel')} className="flex items-center gap-1">
              {WINDOWS.map((w) => (
                <Link
                  key={w}
                  href={`/dashboard/teacher/courses/${courseId}/analytics?days=${w}`}
                  scroll={false}
                >
                  <Button variant={w === days ? 'default' : 'outline'} size="sm">
                    {t('windowDays', { days: w })}
                  </Button>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {warnings.length > 0 && (
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>{t('warningsTitle')}</AlertTitle>
            <AlertDescription>
              <p>{t('warningsDesc')}</p>
              <ul className="mt-1 list-disc pl-4">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* ── Difficulty calibration ─────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconScale className="h-4 w-4 text-muted-foreground" />
              {t('calibration.title')}
            </CardTitle>
            <CardDescription>{t('calibration.desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {hardestItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('calibration.empty')}
              </p>
            ) : (
              <>
                {mislabeled.length > 0 && (
                  <p className="mb-4 text-sm">
                    <Badge variant="destructive" className="mr-2">
                      {mislabeled.length}
                    </Badge>
                    {t('calibration.mismatchSummary', { count: mislabeled.length })}
                  </p>
                )}
                <ul className="divide-y">
                  {hardestItems.map((item) => (
                    <li
                      key={`${item.itemType}-${item.itemId}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                    >
                      <div className="min-w-48 flex-1">
                        <div className="flex items-center gap-2">
                          {item.itemType === 'exercise' ? (
                            <Link
                              href={`/dashboard/teacher/courses/${courseId}/exercises/${item.itemId}`}
                              className="truncate text-sm font-medium hover:underline"
                            >
                              {item.title}
                            </Link>
                          ) : (
                            <span className="truncate text-sm font-medium">{item.title}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t(`scope.${item.itemType}`)} ·{' '}
                          {t('calibration.attempts', { count: item.attemptCount })}
                        </p>
                      </div>
                      <DifficultyDelta
                        declared={item.declaredDifficulty}
                        rating={item.rating}
                        mismatch={item.mismatch}
                        labels={{
                          declared: item.declaredDifficulty
                            ? t(`difficulty.${item.declaredDifficulty}`)
                            : t('difficulty.unlabeled'),
                          measured: t('calibration.measured'),
                          harder: t('calibration.harderThanLabeled'),
                          easier: t('calibration.easierThanLabeled'),
                        }}
                      />
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <IconInfoCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t('calibration.ratingHint')}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Confusion hotspots ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconFlame className="h-4 w-4 text-muted-foreground" />
              {t('hotspots.title')}
            </CardTitle>
            <CardDescription>{t('hotspots.desc', { days })}</CardDescription>
          </CardHeader>
          <CardContent>
            {hotspots.length === 0 ? (
              <div className="py-8 text-center">
                <IconChartBar className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {totalSignals === 0 ? t('hotspots.noData') : t('hotspots.allClear')}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {hotspots.map((h) => {
                  const href = hotspotHref(courseId, h)
                  return (
                    <li
                      key={`${h.scope}-${String(h.ref)}`}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-48 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <HotspotScopeBadge scope={h.scope} label={t(`scope.${h.scope}`)} />
                            {href ? (
                              <Link href={href} className="text-sm font-medium hover:underline">
                                {h.label}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium">{h.label}</span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {hotspotEvidence(h, t)}
                          </p>
                        </div>
                        <SeverityBar value={h.severity} label={t('hotspots.severity')} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              {t('hotspots.sources', {
                practice: sources.practiceAttempts,
                exercises: sources.exerciseEvaluations,
                checkpoints: sources.checkpointAttempts,
                exams: sources.examSubmissions,
                days,
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
