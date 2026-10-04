import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { IconArrowLeft } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getPromptGradingRoster } from '@/lib/community/prompt-grading'
import { parseGradingFilter, rosterCounts } from '@/lib/community/prompt-grades'
import { CommunityMarkdown } from '@/components/community/community-markdown'
import { PromptDueBadge } from '@/components/community/prompt-grade'
import { PromptGradingView } from '@/components/community/prompt-grading-view'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PageProps {
  params: Promise<{ courseId: string; postId: string }>
  searchParams: Promise<{ filter?: string | string[] }>
}

/**
 * Grade a graded discussion prompt (#873): every student of the course, whether
 * they answered, their answers, and a score + feedback form. Same gate as the
 * course community page: the course's author or an admin of this school.
 */
export default async function PromptGradingPage({ params, searchParams }: PageProps) {
  const { courseId, postId } = await params
  const numericCourseId = Number(courseId)
  if (!Number.isInteger(numericCourseId) || numericCourseId <= 0 || !UUID.test(postId)) notFound()

  const role = await getUserRole()
  if (role !== 'teacher' && role !== 'admin') redirect('/dashboard')

  const userId = await getCurrentUserId()
  if (!userId) redirect('/auth/login')

  const tenantId = await getCurrentTenantId()
  const admin = createAdminClient()

  const [{ data: course }, { data: enabled }] = await Promise.all([
    admin
      .from('courses')
      .select('course_id, title, author_id')
      .eq('course_id', numericCourseId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin.rpc('community_enabled', { _tenant_id: tenantId }),
  ])
  if (!course) notFound()
  if (course.author_id !== userId && role !== 'admin') redirect('/dashboard/teacher')
  if (!enabled) redirect(`/dashboard/teacher/courses/${numericCourseId}/community`)

  const roster = await getPromptGradingRoster({ tenantId, courseId: numericCourseId, postId })
  if (!roster) notFound()

  const t = await getTranslations('community.grading')
  const tCommunity = await getTranslations('community')
  const { prompt, rows } = roster
  const counts = rosterCounts(rows)
  const query = await searchParams
  const initialFilter = query.filter === undefined ? 'ungraded' : parseGradingFilter(query.filter)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-3xl space-y-2 px-4 py-5 sm:px-6 lg:px-8">
          <Link
            href={`/dashboard/teacher/courses/${numericCourseId}/community?post=${prompt.id}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('backToCommunity')}
          </Link>
          <p className="text-xs text-muted-foreground">{course.title}</p>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="grading-title">
            {t('title')}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{tCommunity('graded')}</Badge>
            <PromptDueBadge dueAt={prompt.due_at} />
            {prompt.lesson && (
              <Badge variant="outline">{t('lesson', { lesson: prompt.lesson.title })}</Badge>
            )}
            <span className="text-sm text-muted-foreground" data-testid="grading-summary">
              {t('summary', { graded: counts.graded, total: counts.all })}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="space-y-2 rounded-xl border-l-4 border-primary bg-card p-4">
          {prompt.title && <h2 className="font-semibold">{prompt.title}</h2>}
          <CommunityMarkdown content={prompt.content} className="text-sm" collapsible />
        </section>

        <p className="text-xs text-muted-foreground">{t('certificateNote')}</p>

        <PromptGradingView courseId={numericCourseId} postId={prompt.id} rows={rows} initialFilter={initialFilter} />
      </main>
    </div>
  )
}
