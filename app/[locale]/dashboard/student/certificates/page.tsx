import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconCertificate, IconBook2, IconTrophy, IconAward } from '@tabler/icons-react'
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

  // Get unique courses with certificates for stats
  const uniqueCourses = new Set(certificates?.map(c => c.course_id) || [])

  return (
    <div className="mx-auto container py-8 px-4 lg:px-8 space-y-6" data-testid="certificates-page">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <IconCertificate size={20} />
            </div>
            <h1 className="text-2xl font-black tracking-tight" data-testid="certificates-title">
              {t('title')}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {certificates && certificates.length > 0
              ? t('earned', { count: certificates.length })
              : t('subtitle')}
          </p>
        </div>
        <Link href="/dashboard/student/courses">
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs font-bold">
            <IconBook2 size={14} />
            {t('myCourses')}
          </Button>
        </Link>
      </div>

      {/* Stats Row */}
      {certificates && certificates.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <IconAward size={14} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{t('statsTotal')}</span>
            </div>
            <p className="text-2xl font-black tabular-nums">{certificates.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <IconBook2 size={14} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{t('statsCourses')}</span>
            </div>
            <p className="text-2xl font-black tabular-nums">{uniqueCourses.size}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <IconTrophy size={14} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{t('statsLatest')}</span>
            </div>
            <p className="text-sm font-bold truncate">
              {certificates[0]?.courses?.title || '-'}
            </p>
          </div>
        </div>
      )}

      {/* Certificates List */}
      {!certificates || certificates.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-muted-foreground/15 p-16 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-5">
            <IconCertificate className="w-7 h-7 text-amber-500/60" />
          </div>
          <h3 className="text-lg font-bold mb-2">{t('noCertificates')}</h3>
          <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
            {t('noCertificatesDescription')}
          </p>
          <Link href="/dashboard/student/browse">
            <Button>{t('browseCourses')}</Button>
          </Link>
        </div>
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
