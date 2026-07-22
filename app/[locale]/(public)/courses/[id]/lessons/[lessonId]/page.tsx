import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LessonContent } from '@/app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/lesson-content'
import { serializeLessonMdx } from '@/app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/serialize-lesson'
import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: Promise<{ id: string; lessonId: string; locale: string }>
}

// Public free-preview lesson view (#426). Reachable by anyone — including
// logged-out visitors (/courses/* is in the proxy public-route allowlist).
// Uses the admin client with explicit guards mirroring the anon RLS policy:
// published preview lesson, published course, current tenant. Read-only:
// no completion tracking, no checkpoints, no comments, no AI task.
// cache() dedupes the generateMetadata + page calls within a request.
const getPreviewLesson = cache(async (courseId: number, lessonId: number, tenantId: string) => {
    if (!Number.isInteger(courseId) || !Number.isInteger(lessonId)) return null
    const admin = createAdminClient()

    const [{ data: course }, { data: lesson }] = await Promise.all([
        admin
            .from('courses')
            .select('course_id, title')
            .eq('course_id', courseId)
            .eq('tenant_id', tenantId)
            .eq('status', 'published')
            .single(),
        admin
            .from('lessons')
            .select('id, title, sequence, description, content, video_url, embed_code')
            .eq('id', lessonId)
            .eq('course_id', courseId)
            .eq('tenant_id', tenantId)
            .eq('status', 'published')
            .eq('is_preview', true)
            .single(),
    ])
    if (!course || !lesson) return null

    return { course, lesson }
})

export async function generateMetadata(props: PageProps): Promise<Metadata> {
    const { id, lessonId, locale } = await props.params
    const tenantId = await getCurrentTenantId()
    const data = await getPreviewLesson(Number(id), Number(lessonId), tenantId)
    if (!data) notFound()
    return buildPageMetadata({
        title: `${data.lesson.title} — ${data.course.title}`,
        description: data.lesson.description?.replace(/\s+/g, ' ').trim().slice(0, 160) || data.course.title,
        path: `/courses/${id}/lessons/${lessonId}`,
        locale,
    })
}

export default async function PublicLessonPreviewPage(props: PageProps) {
    const { id, lessonId } = await props.params
    const [t, tenantId] = await Promise.all([
        getTranslations('coursePublicDetails'),
        getCurrentTenantId(),
    ])

    const data = await getPreviewLesson(Number(id), Number(lessonId), tenantId)
    if (!data) notFound()
    const { course, lesson } = data

    return (
        // pt-16 clears the public layout's fixed navbar
        <div className="min-h-screen bg-background pt-16">
            {/* Preview notice banner */}
            <div className="border-b bg-primary/5">
                <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 text-sm">
                        <Sparkles className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
                        <span className="font-semibold text-primary flex-shrink-0">{t('preview.badge')}</span>
                        <span className="text-muted-foreground truncate">{t('preview.notice')}</span>
                    </div>
                    <Link href={`/courses/${id}`} className="flex-shrink-0">
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                            {t('preview.backToCourse')}
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10 space-y-10">
                {/* Lesson header */}
                <header>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">
                        {course.title}
                    </p>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-balance">
                        {lesson.title}
                    </h1>
                    {lesson.description && (
                        <p className="mt-2 text-muted-foreground leading-relaxed">{lesson.description}</p>
                    )}
                </header>

                <LessonContent
                    mdx={await serializeLessonMdx(lesson.content)}
                    videoUrl={lesson.video_url}
                    embedCode={lesson.embed_code}
                    embedMode="sandboxed"
                />

                {/* Enroll CTA */}
                <section className="rounded-2xl border-2 border-primary/10 bg-gradient-to-b from-primary/[0.06] to-transparent p-6 md:p-8 text-center space-y-4">
                    <h2 className="text-xl font-bold">{t('preview.enrollTitle')}</h2>
                    <Link href={`/courses/${id}`} className="inline-block">
                        <Button size="lg" className="gap-2">
                            {t('preview.enrollCta')}
                        </Button>
                    </Link>
                </section>
            </div>
        </div>
    )
}
