import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations } from 'next-intl/server'
import { TemplateForm } from '@/components/teacher/template-form'
import { IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/teacher/templates" aria-label={t('backToTemplates')}>
          <Button variant="ghost" size="icon">
            <IconArrowLeft size={20} />
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('editTemplate')}</h2>
          <p className="text-muted-foreground">
            {t('editDescription')}
          </p>
        </div>
      </div>

      <TemplateForm initialData={template} id={id} />
    </div>
  )
}
