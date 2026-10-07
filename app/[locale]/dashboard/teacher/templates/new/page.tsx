import { TemplateForm } from '@/components/teacher/template-form'
import { PageShell, PageHeader } from '@/components/dashboard/page-shell'
import { getTranslations } from 'next-intl/server'

export default async function NewTemplatePage() {
  const t = await getTranslations('dashboard.teacher.templates')

  return (
    <PageShell variant="form">
      <PageHeader
        back={{ href: '/dashboard/teacher/templates', label: t('backToTemplates') }}
        title={t('createTemplate')}
        description={t('createDescription')}
      />

      <TemplateForm />
    </PageShell>
  )
}
