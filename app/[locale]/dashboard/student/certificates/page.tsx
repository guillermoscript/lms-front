import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IconCertificate } from '@tabler/icons-react'
import Link from 'next/link'
import { StudentCertificateCard } from '@/components/student/student-certificate-card'

export default async function StudentCertificatesPage() {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.student.certificates')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch certificates with related course and template data
  const { data: certificates } = await supabase
    .from('certificates')
    .select(`
      *,
      courses (
        course_id,
        title
      ),
      certificate_templates (
        template_id,
        template_name,
        design_settings,
        issuer_name,
        signature_name,
        signature_title
      )
    `)
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .order('issued_at', { ascending: false })

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl" data-testid="certificates-page">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <IconCertificate className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight" data-testid="certificates-title">
            {t('title')}
          </h1>
        </div>
        <p className="text-muted-foreground">
          {certificates && certificates.length > 0
            ? t('earned', { count: certificates.length })
            : t('subtitle')}
        </p>
      </div>

      {!certificates || certificates.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-muted p-4 rounded-full">
                <IconCertificate className="w-8 h-8 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">{t('noCertificates')}</h3>
            <p className="text-muted-foreground mb-6">{t('noCertificatesDescription')}</p>
            <Link href="/dashboard/student/browse">
              <Button>{t('browseCourses')}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {certificates.map((cert: any) => (
            <StudentCertificateCard key={cert.certificate_id} certificate={cert} />
          ))}
        </div>
      )}
    </div>
  )
}
