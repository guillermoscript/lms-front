import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations } from 'next-intl/server'
import { TemplateForm } from '@/components/teacher/template-form'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import { notFound } from 'next/navigation'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

interface EditTemplatePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function EditTemplatePage({ params }: EditTemplatePageProps) {
  const { id } = await params
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.teacher.templates')
  const { data: template, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !template) {
    notFound()
  }

  return (
    <PageShell variant="form">
      <PageHeader
        back={{ href: '/dashboard/teacher/templates', label: t('backToTemplates') }}
        title={t('editTemplate')}
        description={t('editDescription')}
      />

      <TemplateForm initialData={template} id={id} />
    </PageShell>
  )
}
