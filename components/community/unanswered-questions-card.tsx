import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconArrowRight, IconHelpCircle } from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createAdminClient } from '@/lib/supabase/admin'
import { QUESTION_FILTER_PARAM } from '@/lib/community/questions'

const MAX_LISTED = 5

/**
 * The teacher's daily to-do (#875): unanswered questions in the courses they
 * teach, each course linking to its feed filtered to them. Hidden when the
 * school's plan has no community or the teacher has no course.
 */
export async function UnansweredQuestionsCard({
  tenantId,
  courses,
}: {
  tenantId: string
  courses: { course_id: number; title: string | null }[]
}) {
  if (courses.length === 0) return null

  const admin = createAdminClient()
  const { data: planFeatures } = await admin.rpc('get_plan_features', { _tenant_id: tenantId })
  if (!planFeatures?.features?.community) return null

  const { data: rows, count, error } = await admin
    .from('community_posts')
    .select('course_id', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('post_type', 'question')
    .eq('is_hidden', false)
    .is('accepted_comment_id', null)
    .in(
      'course_id',
      courses.map((c) => c.course_id)
    )
    .limit(1000)

  if (error) {
    console.error('Failed to count unanswered questions:', error)
    return null
  }

  const t = await getTranslations('community.questions.dashboard')
  const total = count ?? rows?.length ?? 0

  const perCourse = new Map<number, number>()
  for (const row of rows ?? []) {
    if (row.course_id !== null) perCourse.set(row.course_id, (perCourse.get(row.course_id) ?? 0) + 1)
  }
  const listed = courses
    .filter((c) => perCourse.has(c.course_id))
    .sort((a, b) => (perCourse.get(b.course_id) ?? 0) - (perCourse.get(a.course_id) ?? 0))
    .slice(0, MAX_LISTED)

  return (
    <Card data-testid="unanswered-questions-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>
            {total > 0 ? t('summary', { count: total }) : t('allAnswered')}
          </CardDescription>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
          <IconHelpCircle className="h-[18px] w-[18px] text-brand-text" strokeWidth={1.75} aria-hidden />
        </div>
      </CardHeader>
      {listed.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {listed.map((course) => (
              <li key={course.course_id}>
                <Link
                  href={`/dashboard/teacher/courses/${course.course_id}/community?${QUESTION_FILTER_PARAM}=unanswered`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-foreground"
                >
                  <span className="min-w-0 truncate">{course.title || t('untitledCourse')}</span>
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <span className="tabular-nums">{t('courseCount', { count: perCourse.get(course.course_id) ?? 0 })}</span>
                    <IconArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
