import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react'
import { CertificateTemplateForm } from '@/components/teacher/certificate-template-form'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'

interface PageProps {
    params: Promise<{ courseId: string }>
}

export default async function CertificateSettingsPage({ params }: PageProps) {
    const { courseId } = await params
    const supabase = await createClient()
    const t = await getTranslations('dashboard.teacher.manageCourse')
    const tenantId = await getCurrentTenantId()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const role = await getUserRole()

    const { data: course } = await supabase
        .from('courses')
        .select('*')
        .eq('course_id', parseInt(courseId))
        .eq('tenant_id', tenantId)
        .single()

    if (!course) notFound()

    const isOwner = course.author_id === user.id
    const isAdmin = role === 'admin'

    if (!isOwner && !isAdmin) {
        redirect(`/dashboard/teacher/courses/${courseId}`)
    }

    const { data: template } = await supabase
        .from('certificate_templates')
        .select('*')
        .eq('course_id', parseInt(courseId))
        .eq('tenant_id', tenantId)
        .single()

    return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Breadcrumb */}
            <div className="mb-8 flex items-center gap-2">
                <Link href={`/dashboard/teacher/courses/${courseId}/certificates`} aria-label={t('backToCourses')}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <IconArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="truncate max-w-[200px]">{course.title}</span>
                    <IconChevronRight className="h-3 w-3 shrink-0" />
                    <Link
                        href={`/dashboard/teacher/courses/${courseId}/certificates`}
                        className="hover:text-foreground transition-colors"
                    >
                        {t('certificates.title')}
                    </Link>
                    <IconChevronRight className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">
                        {template ? t('certificates.templates.edit') : t('certificates.templates.create')}
                    </span>
                </div>
            </div>

            <CertificateTemplateForm
                courseId={parseInt(courseId)}
                initialData={template}
            />
        </div>
    )
}
