import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import dynamic from 'next/dynamic'
import { CertificateSettingsFormSkeleton } from './form-skeleton'

// No dynamic fallback: the route's loading.tsx already shows the matching skeleton.
const CertificateTemplateForm = dynamic(
  () => import('@/components/teacher/certificate-template-form').then(m => m.CertificateTemplateForm),
  { loading: () => <CertificateSettingsFormSkeleton /> }
)
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCertificateTier } from '@/lib/plans/server'
import { getSchoolBrand } from '@/lib/themes/school-brand'

interface PageProps {
    params: Promise<{ courseId: string }>
}

export default async function CertificateSettingsPage({ params }: PageProps) {
    const { courseId } = await params
    const supabase = await createClient()
    const t = await getTranslations('dashboard.teacher.manageCourse')
    const tenantId = await getCurrentTenantId()

    const userId = await getCurrentUserId()
    if (!userId) redirect('/auth/login')

    const role = await getUserRole()

    const { data: course } = await supabase
        .from('courses')
        .select('*')
        .eq('course_id', parseInt(courseId))
        .eq('tenant_id', tenantId)
        .single()

    if (!course) notFound()

    const isOwner = course.author_id === userId
    const isAdmin = role === 'admin'

    if (!isOwner && !isAdmin) {
        redirect(`/dashboard/teacher/courses/${courseId}`)
    }

    // Free plan = basic certificates: the platform design only (#662).
    const certificateTier = await getCertificateTier(tenantId)
    const brand = await getSchoolBrand(tenantId)

    const { data: template } = await supabase
        .from('certificate_templates')
        .select('*')
        .eq('course_id', parseInt(courseId))
        .eq('tenant_id', tenantId)
        .single()

    return (
        <PageShell variant="wide">
            <PageHeader
                back={{ href: `/dashboard/teacher/courses/${courseId}/certificates`, label: t('certificates.title') }}
                title={template ? t('certificates.templates.edit') : t('certificates.templates.create')}
                description={course.title}
            />

            <CertificateTemplateForm
                courseId={parseInt(courseId)}
                tenantId={tenantId}
                initialData={template}
                certificateTier={certificateTier === 'custom' ? 'custom' : 'basic'}
                brand={brand.outputs}
            />
        </PageShell>
    )
}
