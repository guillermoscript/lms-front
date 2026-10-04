import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconArrowRight, IconChecklist } from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPromptsToGrade } from '@/lib/community/prompt-grading'

const MAX_LISTED = 5

/**
 * The teacher's grading queue for graded discussion prompts (#873), next to the
 * unanswered-questions card: answers waiting for a grade in the courses they
 * teach, each prompt linking to its grading view. Hidden when the plan has no
 * community or nothing was ever graded-prompted.
 */
export async function PromptsToGradeCard({
  tenantId,
  courses,
}: {
  tenantId: string
  courses: { course_id: number; title: string | null }[]
}) {
  if (courses.length === 0) return null

  const admin = createAdminClient()
  const { data: enabled } = await admin.rpc('community_enabled', { _tenant_id: tenantId })
  if (!enabled) return null

  let queue: Awaited<ReturnType<typeof getPromptsToGrade>>
  try {
    queue = await getPromptsToGrade({ tenantId, courseIds: courses.map((c) => c.course_id) })
  } catch (error) {
    console.error('Failed to load the prompt grading queue:', error)
    return null
  }
  if (queue.total === 0) return null

  const t = await getTranslations('community.grading.dashboard')
  const courseTitle = new Map(courses.map((c) => [c.course_id, c.title]))

  return (
    <Card data-testid="prompts-to-grade-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('summary', { count: queue.total })}</CardDescription>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
          <IconChecklist className="h-[18px] w-[18px] text-brand-text" strokeWidth={1.75} aria-hidden />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {queue.prompts.slice(0, MAX_LISTED).map((prompt) => (
            <li key={prompt.postId}>
              <Link
                href={`/dashboard/teacher/courses/${prompt.courseId}/community/prompts/${prompt.postId}`}
                className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-foreground"
              >
                <span className="min-w-0">
                  <span className="block truncate">{prompt.label ?? t('untitled')}</span>
                  {courseTitle.get(prompt.courseId) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {courseTitle.get(prompt.courseId)}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  <span className="tabular-nums">{t('promptCount', { count: prompt.waiting })}</span>
                  <IconArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
