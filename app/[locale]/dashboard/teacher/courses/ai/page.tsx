import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import Link from 'next/link'
import { IconArrowLeft } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { CourseArchitectWorkspace } from '@/components/teacher/course-architect/course-architect-workspace'

export default async function CourseArchitectPage({
    searchParams,
}: {
    searchParams: Promise<{ courseId?: string }>
}) {
    const t = await getTranslations('courseArchitect')
    const locale = (await getLocale()) === 'es' ? 'es' : 'en'
    const tenantId = await getCurrentTenantId()
    const userId = await getCurrentUserId()
    if (!userId) redirect('/auth/login')

    const { courseId: rawCourseId } = await searchParams
    let courseId: number | null = null
    const parsed = Number(rawCourseId)
    if (Number.isInteger(parsed) && parsed > 0) {
        const supabase = await createClient()
        const { data } = await supabase
            .from('courses')
            .select('course_id')
            .eq('course_id', parsed)
            .eq('tenant_id', tenantId)
            .maybeSingle()
        courseId = data?.course_id ?? null
    }

    return (
        <div className="mx-auto container space-y-6 px-4 py-8 sm:px-6 lg:px-8" data-testid="course-architect-page">
            <div className="flex items-center gap-2">
                <Link href="/dashboard/teacher/courses">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('back')}>
                        <IconArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <span className="text-sm font-medium text-foreground">{t('back')}</span>
            </div>
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
            </div>
            <CourseArchitectWorkspace initialCourseId={courseId} tenantId={tenantId} locale={locale} />
        </div>
    )
}
